# Events Service API Reference

This document lists all the APIs available in the `events-service`, describing what they do and how they are typically utilized by the frontend applications.

All endpoints are prefixed with `/v1` (e.g., `GET /v1/events`).

---

## 📅 1. Events Discovery & Management

| Method | Endpoint | Auth | Purpose | Primary Utilization |
|--------|----------|------|---------|---------------------|
| `GET` | `/events` | Public | Fetches a paginated list of published events (supports filtering). | **Event Feed / Explore Page:** Showing users upcoming events to browse. |
| `GET` | `/events/:id` | Optional | Fetches full details for a single event. | **Event Details Page:** Displaying the full description, location, schedule, and metadata. |
| `POST` | `/events` | Organizer | Creates a new draft event. | **Create Event Form:** Used by organizers to start setting up a new event. |
| `PATCH` | `/events/:id` | Organizer | Updates details of an existing event. | **Edit Event Form:** Organizer saving iterative changes to an event draft. |
| `DELETE` | `/events/:id` | Organizer | Deletes an event. | **Organizer Dashboard:** Removing canceled or mistaken draft events. |
| `POST` | `/events/:id/publish` | Organizer | Publishes an event, making it visible to the public. | **Event Manager:** The final step to open registrations/sales to the public. |
| `GET` | `/organizers/me/events` | Organizer | Fetches all events created by the logged-in user. | **Organizer Dashboard:** Listing the organizer's past, draft, and active events. |

---

## 🔖 2. Saved Events (Bookmarks)

| Method | Endpoint | Auth | Purpose | Primary Utilization |
|--------|----------|------|---------|---------------------|
| `POST` | `/events/:id/save` | User | Toggles (saves or unsaves) an event for the user. | **Heart/Bookmark Button:** Allowing users to easily bookmark events for later. |
| `GET` | `/users/me/saved-events` | User | Fetches all events the user has saved. | **Saved Tab (User Profile):** Displaying the user's personal watchlist. |

---

## 🎟️ 3. Ticket Types (Pricing & Tiers)

| Method | Endpoint | Auth | Purpose | Primary Utilization |
|--------|----------|------|---------|---------------------|
| `POST` | `/ticket-types` | Organizer | Creates a new ticket tier (e.g., VIP, General). | **Event Setup:** Pricing and capacity configuration for a specific tier. |
| `GET` | `/events/:id/ticket-types` | Public | Returns all available ticket types for an event. | **Checkout Selection:** Showing users their purchasing options and remaining tier capacity. |

---

## 🛒 4. Reservation & Checkout Flow

*(This is the modern checkout flow used for both free and paid events. See `event-registration-flow.md` for deep dive.)*

| Method | Endpoint | Auth | Purpose | Primary Utilization |
|--------|----------|------|---------|---------------------|
| `POST` | `/events/:id/reserve` | User | Holds capacity (creates an `EventReservation`) for 10 minutes. | **Start Checkout:** Reserving seats immediately when the user clicks "Checkout". |
| `POST` | `/reservations/:id/cancel` | User | Explicitly releases a reserved hold. | **Abandon Checkout:** Freeing up capacity if the user clicks "Back" or cancels. |
| `POST` | `/events/:id/checkout` | User | Generates a Stripe Payment Intent. | **Payment Form:** Getting the Stripe `clientSecret` to render the credit card UI. |
| `POST` | `/events/:id/finalize` | User | Verifies payment, finalizes registration, issues QR tickets. | **Payment Success / Free Confirmation:** The final API call that officially registers the user. |

---

## 🎒 5. Registrations & User Tickets

| Method | Endpoint | Auth | Purpose | Primary Utilization |
|--------|----------|------|---------|---------------------|
| `GET` | `/users/me/event-registrations` | User | Fetches all successful registrations + generated `EventTicket`s for the user. | **My Tickets Tab:** Showing the user their upcoming/past events and their scannable QR codes. |
| `GET` | `/events/:id/registrations` | Organizer | Fetches all attendees registered for a specific event. | **Attendee List Dashboard:** Allowing organizers to export or view the guest list. |
| `PATCH` | `/registrations/:id/status` | Organizer | Manually updates registration status (Approve/Reject). | **Approval Workflow:** For private or invitation-only events requiring manual organizer approval before payment/tickets. |
| `POST` | `/events/:id/register` | User | Legacy/direct registration endpoint. | *May be deprecated by the Reservation → Finalize flow.* |

---

## 📲 6. Door Check-In

| Method | Endpoint | Auth | Purpose | Primary Utilization |
|--------|----------|------|---------|---------------------|
| `POST` | `/tickets/checkin` | Organizer | Validates a `ticketId` (from QR code) and marks it `checked_in`. | **Scanner App (Organizer):** Used at the venue doors by event staff scanning user QR codes to prevent duplicate entries. |

---

## 💬 7. Event Discussion & Q&A

| Method | Endpoint | Auth | Purpose | Primary Utilization |
|--------|----------|------|---------|---------------------|
| `GET` | `/events/:id/discussion` | Public | Fetches all top-level comments and nested replies for an event. | **Discussion Tab:** Rendering the community chat or Q&A below an event description. |
| `POST` | `/events/:id/discussion` | User | Adds a new comment or replies to an existing one. | **Comment Input:** Users asking the organizer a question, or the organizer broadcasting an update. |

---

## 🔍 8. Advanced Search

| Method | Endpoint | Auth | Purpose | Primary Utilization |
|--------|----------|------|---------|---------------------|
| `GET` | `/v1/search/events` | Public | Full-text search using MongoDB Atlas Search pipelines. | **Global Search Bar:** Autocomplete / fuzzy search for events across the entire platform. |
