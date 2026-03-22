# API Reference: Users & Settings

> Endpoints for managing public profiles, account preferences, security settings, and account lifecycle (deactivation/deletion).

**Base URLs**: 
- `/api/users`
- `/api/users/me/settings`
- `/api/users/me`

---

## 1. Public Users API

### GET /api/users/:id

Fetch the public profile of a user by their MongoDB `_id`.

**Parameters (URL):**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | 24-character hex string (ObjectId) |

**Response:**
- `200 OK`: User object (excludes `passwordHash`, `otp`, and `otpExpires`).
- `400 Bad Request`: Invalid ID format.
- `404 Not Found`: User does not exist.

---

## 2. Settings API

Manage user preferences. Requires `Authorization: Bearer <token>`.

### GET /api/users/me/settings

Retrieve the current authenticated user's settings, populated with default values if unset.

**Response:**
- `200 OK`: 
```json
{
  "meta": { "success": true },
  "data": {
    "settings": {
      "privacy": {
        "profileVisibility": "public",
        "showEmail": false,
        "showPhone": false,
        "showLocation": true
      },
      "notifications": { ... },
      "messaging": { ... },
      "account": { ... }
    }
  }
}
```

### PATCH /api/users/me/settings

Partially update the user's settings. 

**Notes**: 
- Attempting to update restricted fields outside `settings.*` (e.g., `role`, `kycStatus`) will result in a 403.
- If `notifications.allowConnectionRequests` is `false`, `messaging.allowMessagesFrom` cannot be set to `connections`.

**Parameters (Body - Partial Object):**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `privacy.*` | object | No | E.g. `showEmail: true` |
| `notifications.*`| object | No | Push / email toggles |
| `messaging.*` | object | No | E.g. `readReceipts: false` |
| `account.*` | object | No | Locale / Currency settings |

**Response:**
- `200 OK`: Returns the fully normalized updated settings object.
- `400 Bad Request`: Validation failure or conflicting constraints.
- `403 Forbidden`: Attempted to update restricted top-level keys.

---

## 3. Security API

Manage passwords and active sessions. Requires `Authorization: Bearer <token>`.

### POST /api/users/me/change-password

Update the account password. Not available for social login (SSO) accounts.

**Parameters (Body):**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `currentPassword`| string | Yes | Existing password |
| `newPassword` | string | Yes | Min 8 characters |

**Response:**
- `200 OK`: Password changed successfully.
- `400 Bad Request`: Validation error or SSO account.
- `401 Unauthorized`: Current password incorrect.

### GET /api/users/me/sessions
Returns the user's active devices.

### DELETE /api/users/me/sessions/:deviceId
Removes a specific device from the active sessions array.

### DELETE /api/users/me/sessions
Clears ALL devices, performing a global logout.

---

## 4. Danger Zone API

Account lifecycle management. Requires `Authorization: Bearer <token>`.

### POST /api/users/me/deactivate

Temporarily deactivates the account (`blocked = true`). User can reverse this by logging back in. Requires password confirmation.

**Parameters (Body):**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `password`| string | Yes | Required for re-auth |

**Response:**
- `200 OK`: Account deactivated.
- `401 Unauthorized`: Incorrect password.

### POST /api/users/me/delete

Schedules the account for permanent deletion after a 30-day grace period. Requires textual confirmation instead of a password.

**Parameters (Body):**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `confirmationText` | string | Yes | Must be exactly "delete" (case insensitive) |
| `reason` | string | No | Reason for deletion |

**Response:**
- `200 OK`: Account scheduled for deletion.

### POST /api/users/me/restore

Restores an account that is currently `scheduled_for_deletion`, provided the grace period has not expired. No payload required.

**Response:**
- `200 OK`: Account successfully restored.
- `410 Gone`: The grace period has expired.
- `400 Bad Request`: Account was not scheduled for deletion.
