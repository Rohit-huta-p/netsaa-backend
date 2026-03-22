# User Deletion Cascade — `onDelete` Reference

> **Last Updated:** 2026-03-19  
> **Scope:** `users-service`, `events-service`, `gigs-service`

This document defines what must be removed, anonymized, or updated across all services when a user account is deleted. The `User` model already supports a soft-delete flow via `accountStatus` (`active` → `scheduled_for_deletion` → `permanently_deleted`).

---

## Model Overview

### users-service

| Model | Key User-Linked Fields | Notes |
|-------|----------------------|-------|
| `User` | `email`, `role`, `accountStatus`, `deletedAt`, `deletionScheduledAt`, `galleryUrls[]`, `videoUrls[]`, `devices[]`, `marketingConsent` | Source of truth — soft-delete fields already present |
| `Artist` | `userId` → `User._id` | Role-specific profile for artists |
| `Organizer` | `userId` → `User._id` | Role-specific profile for organizers |

### events-service

| Model | User-Linked Fields | Impact |
|-------|-------------------|--------|
| `Event` | `organizerId`, `hostId`, `organizerSnapshot`, `hostSnapshot` | Events created/hosted by the user |
| `EventComment` | `authorId`, `authorName`, `authorImageUrl` | Comments posted by the user |
| `EventRegistration` | `userId` | Registrations made by the user |
| `EventReservation` | `userId` | Active/pending reservations |
| `EventTicket` | `userId` | Issued tickets |
| `EventStats` | `eventId` only | ✅ No direct user link |
| `EventTicketType` | `eventId` only | ✅ No direct user link |
| `SavedEvent` | `userId` (stored as `String` ⚠️) | User's bookmarked events |

### gigs-service

| Model | User-Linked Fields | Impact |
|-------|-------------------|--------|
| `Gig` | `organizerId`, `organizerSnapshot` | Gigs posted by the organizer |
| `GigApplication` | `artistId`, `artistSnapshot` | Applications submitted by the artist |
| `GigComment` | `authorId`, `authorName`, `authorImageUrl` | Comments posted by the user |
| `GigStats` | `gigId` only | ✅ No direct user link |
| `SavedGig` | `userId` | User's bookmarked gigs |

---

## Deletion Phases

### Phase 1 — Immediate Soft Delete (`users-service`)

Triggered the moment the user initiates account deletion.

| Action | Collection | Operation |
|--------|-----------|-----------|
| Set `accountStatus = 'scheduled_for_deletion'` | `User` | `findByIdAndUpdate` |
| Set `deletionScheduledAt = now + 30 days` | `User` | same update |
| Anonymize `email` → `deleted_<id>@deleted.netsa` | `User` | same update |
| Store original email in `originalEmail` | `User` | already in schema ✅ |
| Clear `devices[]` (removes push tokens) | `User` | `$set: { devices: [] }` |
| Clear `passwordHash` | `User` | `$unset: { passwordHash: 1 }` |

---

### Phase 2 — Cross-Service Cascade (Event-Driven / Background Job)

Triggered immediately after Phase 1 via internal events or a background job.

#### users-service

| Action | Collection | Operation |
|--------|-----------|-----------|
| Delete `Artist` profile | `Artist` | `deleteOne({ userId })` |
| Delete `Organizer` profile | `Organizer` | `deleteOne({ userId })` |

#### gigs-service

| Action | Collection | Operation | Priority |
|--------|-----------|-----------|----------|
| Delete user's saved gigs | `SavedGig` | `deleteMany({ userId })` | 🟢 Safe to hard delete |
| Delete user's gig comments | `GigComment` | `deleteMany({ authorId })` | 🟡 Or anonymize text |
| Withdraw gig applications (as artist) | `GigApplication` | `deleteMany({ artistId })` OR `updateMany({ artistId }, { status: 'rejected' })` | 🔴 Check if organizer is tracking |
| Close gigs posted by organizer | `Gig` | `updateMany({ organizerId }, { status: 'closed' })` | 🔴 Do NOT hard delete — preserve history |
| Scrub `organizerSnapshot` on their gigs | `Gig` | `updateMany({ organizerId }, { $unset: { organizerSnapshot: 1 } })` | Optional — prevents PII leakage |
| Delete `GigStats` for closed gigs | `GigStats` | `deleteMany({ gigId: { $in: orgGigIds } })` | After gigs are closed |

#### events-service

| Action | Collection | Operation | Priority |
|--------|-----------|-----------|----------|
| Delete user's saved events | `SavedEvent` | `deleteMany({ userId: userId.toString() })` ⚠️ userId is `String` | 🟢 Safe to hard delete |
| Delete user's event comments | `EventComment` | `deleteMany({ authorId })` | 🟡 Or anonymize |
| Cancel user's registrations | `EventRegistration` | `updateMany({ userId }, { status: 'cancelled' })` | 🔴 Keep for financial record |
| Release user's active reservations | `EventReservation` | `updateMany({ userId, status: 'reserved' }, { status: 'released' })` | 🔴 Must release to free capacity |
| Cancel user's issued tickets | `EventTicket` | `updateMany({ userId }, { status: 'cancelled' })` | 🔴 Keep for audit trail |
| Cancel events created by organizer | `Event` | `updateMany({ organizerId }, { status: 'cancelled' })` | 🔴 Do NOT hard delete |
| Remove `hostId`/`hostSnapshot` if user was a host | `Event` | `updateMany({ hostId: userId }, { $unset: { hostId: 1, hostSnapshot: 1 } })` | Medium priority |
| Delete `EventStats` for cancelled events | `EventStats` | `deleteMany({ eventId: { $in: orgEventIds } })` | Optional / Low |

---

### Phase 3 — Permanent Hard Delete (After 30-day Grace Period)

Triggered by a scheduled job when `deletionScheduledAt` is reached.

| Action | Collection | Operation |
|--------|-----------|-----------|
| Set `accountStatus = 'permanently_deleted'` | `User` | `findByIdAndUpdate` |
| Set `mediaPurged = true` | `User` | same update |
| Purge media from storage (S3/CDN) | External | Delete `profileImageUrl`, all `galleryUrls[]`, all `videoUrls[]` |
| Hard delete `User` document (optional) | `User` | `deleteOne` — or keep anonymized for compliance |

---

## ⚠️ Known Issues & Inconsistencies

### 1. `SavedEvent.userId` Type Mismatch
`SavedEvent.userId` is typed as `String` while `SavedGig.userId` is `ObjectId`. This will cause query bugs during deletion. **Must be normalized to `ObjectId` across both.**

### 2. Duplicate `User.ts` in Other Services
Both `events-service` and `gigs-service` contain their own copy of `User.ts` (denormalized). Deletion events must propagate to keep these in sync — use an **event bus** (e.g., RabbitMQ / Kafka topic: `user.deleted`).

### 3. Comment Anonymization vs. Hard Delete
`GigComment` and `EventComment` both store `authorName` and `authorImageUrl` directly. On delete, decide between:
- **Hard delete** — comments disappear entirely (bad UX for event threads)
- **Anonymize** — replace `authorName` with `"Deleted User"`, remove `authorImageUrl` (recommended)

### 4. Snapshot PII on Gigs & Events
`Gig.organizerSnapshot` and `Event.organizerSnapshot` / `hostSnapshot` hold cached PII (name, image URL, rating). These **must be scrubbed** on delete to avoid orphaned PII in other service DBs.

### 5. No Soft-Delete Flag on Related Models
`Gig`, `Event`, `GigApplication`, `EventRegistration` lack an `isDeleted` / `deletedAt` flag. Cascades rely entirely on status field changes — ensure downstream queries filter by `status` correctly.

---

## Recommended Deletion Flow (Summary)

```
User requests deletion
  │
  ├─► Phase 1: Soft-delete User in users-service (immediate)
  │     └─ Anonymize email, clear devices + passwordHash, set scheduledAt
  │
  ├─► Phase 2: Emit event `user.deleted` → consumed by each service
  │     ├─ users-service: delete Artist / Organizer profiles
  │     ├─ gigs-service:  delete SavedGigs, comments, close Gigs, withdraw applications
  │     └─ events-service: delete SavedEvents, cancel reservations/tickets/registrations, cancel Events
  │
  └─► Phase 3: Scheduled job at deletionScheduledAt
        └─ Purge media (S3/CDN), set mediaPurged=true, hard delete User doc
```
