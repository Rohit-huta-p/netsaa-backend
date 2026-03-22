# Database Models & Schemas

> Core MongoDB schemas driving the `users-service`.

---

## 1. User Model (`User.ts`)

The central entity for all physical persons accessing the platform, serving as the base for Authentication and Global Settings.

### Core Fields
- `email` (String, required, unique, indexed)
- `phoneNumber` (String)
- `authProvider` (Enum: `email`, `google`, `apple`, `phone`)
- `passwordHash` (String, optional for SSO)
- `role` (Enum: `artist`, `organizer`, `admin`) - Determines which secondary profile document exists.
- `accountStatus` (Enum: `active`, `deactivated`, `scheduled_for_deletion`, `permanently_deleted`)

### Profile Snapshot Fields
Stored directly on the User model for quick access during authentication without a `$lookup`:
- `displayName`: Public identifier.
- `profileImageUrl`: Avatar thumbnail.
- `kycStatus`: Identity verification state (`none`, `pending`, `approved`, `rejected`).
- **Detailed profile attributes**: `bio`, `location`, `skills`, `experience`, `galleryUrls` (arrays of strings), etc.

### Embedded Documents (Sub-schemas)
- `devices`: Array of `DeviceSubSchema` tracking active sessions, push tokens, and last active dates.
- `settings`: Deep object structure defining user preferences for `privacy`, `notifications`, `messaging`, and `account` (language/timezone).
- `cached`: Denormalized fields like `averageRating` and `primaryCity` utilized for fast indexing and discovery queries.

---

## 2. Artist Model (`Artist.ts`)

An extension document strictly tied to a `User` where `role === 'artist'`.

### Core Fields
- `userId` (ObjectId, references `User`, required, unique)
- `specialities` (String Array, indexed) - e.g. "Guitarist", "DJ".
- `languages`, `genres`, `instruments` (String Arrays)
- `portfolioThumbs` (String Array) - Media snippet URLs.

### Embedded Documents
- `stats`: Tracks historical data such as `eventsAttended`, `eventsHosted`, `averageRating`, `profileViews`, and `totalEarnings`.

---

## 3. Organizer Model (`Organizer.ts`)

An extension document strictly tied to a `User` where `role === 'organizer'`.

### Core Fields
- `userId` (ObjectId, references `User`, required, unique)
- `organizationName` (String, indexed)
- `organizerTypeCategory` (Enum: `individual`, `academy`, `venue`, `brand`, `corporate`, etc.)
- `isCustomCategory` / `customCategoryLabel`: Allows organizers to define untracked categories.

### Embedded Documents
- `primaryContact`: `fullName`, `designation`, `phone`, `email`.
- `billingDetails`: `legalBusinessName`, `gstNumber`, `billingAddress`.
- `organizerStats`: Tracks `gigsPosted`, `eventsCreated`, `artistsHired`, `responseRate`.
- `verification`: Tracks advanced KYC for organizers (`businessVerified`, `gstNumber`, `verificationLevel`).
