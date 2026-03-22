# API Reference: Authentication

> Endpoints for user registration, login, and session management.

**Base URL**: `/api/auth`

---

## POST /register/email

Register a new user (Artist or Organizer) using an email and password.

**Parameters (Body):**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `user.email` | string | Yes | Valid email address |
| `user.password` | string | Yes | Minimum length typically enforced |
| `user.displayName` | string | Yes | Public name of the user |
| `user.role` | string | Optional | `artist`, `organizer` (default `artist`) |
| `organizerProfile.*`| object | Conditional| Required if role is `organizer`. Contains `intent`, `organizationName`, etc. |

**Response:**
- `200 OK`: Returns JWT token and User object.
- `400 Bad Request`: Validation failure or email already exists.
- `500 Server Error`: Transaction failed.

---

## POST /login/email

Authenticate a user with email and password. Also reactivates deactivated accounts.

**Parameters (Body):**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `email` | string | Yes | Registered email |
| `password` | string | Yes | Plain text password |

**Response:**
- `200 OK`: Returns JWT token and User object.
- `400 Bad Request`: Invalid credentials.

---

## POST /register/phone

Initiate phone number registration/login by sending an OTP.

**Parameters (Body):**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `phone` | string | Yes | Phone number |
| `name` | string | Yes | Display name |
| `userType` | string | Optional | Role (`artist`, `organizer`) |

**Response:**
- `200 OK`: OTP sent successfully.
- `400 Bad Request`: User already exists.

---

## POST /verify-otp

Verify the OTP sent to the phone and log the user in.

**Parameters (Body):**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `phone` | string | Yes | Phone number |
| `otp` | string | Yes | 6-digit OTP |

**Response:**
- `200 OK`: Returns JWT token.
- `400 Bad Request`: Invalid or expired OTP.

---

## GET /me

Fetch the current authenticated user's profile.

**Headers:**
- `Authorization`: `Bearer <token>`

**Response:**
- `200 OK`: Full User object (excluding `passwordHash`).
- `401 Unauthorized`: Missing or invalid token.

---

## PATCH /me

Update the current authenticated user's profile fields.

**Headers:**
- `Authorization`: `Bearer <token>`

**Parameters (Body):**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `displayName` | string | No | Updated display name |
| `bio`, `location`| string | No | Profile text fields |
| `galleryUrls` | string[]| No | Array of media URLs |
| `*` | mixed | No | Various profile attributes supported |

**Response:**
- `200 OK`: Updated User object.
- `401 Unauthorized`: Missing or invalid token.
