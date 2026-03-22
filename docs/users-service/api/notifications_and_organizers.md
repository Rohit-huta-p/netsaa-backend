# API Reference: Notifications & Organizers

> Endpoints for managing user notifications and retrieving/updating specific organizer details.
> Note: All routes require `Authorization: Bearer <token>`.

---

## 1. Notifications API

**Base URL**: `/api/notifications`

### GET /
Get the current authenticated user's notifications. Supports pagination.

**Parameters (Query):**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `page` | number | No | Default: 1 |
| `pageSize` | number | No | Default: 20, Max: 100 |
| `unreadOnly`| boolean| No | Default: false |
| `type` | string | No | Filter by specific notification type |

**Response:**
- `200 OK`: Array of Notification objects and pagination metadata.

### GET /unread-count
Retrieve the total number of unread notifications for the user.

**Parameters (Query):**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `type` | string | No | Optional filter by type |

**Response:**
- `200 OK`: Integer count of unread notifications.

### GET /unread-counts-by-type
Retrieve unread notification counts, grouped by their respective types.

**Response:**
- `200 OK`: Object mapping notification types to their unread counts.

### PATCH /read-all
Mark all of the user's notifications as read.

**Parameters (Body):**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `beforeDate`| string | No | ISO date. If provided, only marks notifications created before this date. |

**Response:**
- `200 OK`: Success message and number of updated documents.

### PATCH /:id/read
Mark a specific notification as read.

**Parameters (Path):**
- `id`: The Notification ID.

**Response:**
- `200 OK`: The updated Notification object.

### DELETE /:id
Delete a specific notification.

**Parameters (Path):**
- `id`: The Notification ID.

**Response:**
- `200 OK`: Success message.

---

## 2. Organizers API

**Base URL**: `/api/organizers`

### GET /me
Retrieve the specific Organizer profile associated with the currently authenticated user.

**Response:**
- `200 OK`: The Organizer profile object containing `organizationName`, `organizationType`, `billingDetails`, etc.

### PATCH /me
Update the current authenticated user's Organizer profile.

**Parameters (Body):**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `organizationName` | string | No | Name of the organization |
| `organizationType` | string | No | Venue, Promoter, Festival, etc. |
| `isCustomCategory` | boolean| No | Whether utilizing a custom category |
| `customCategoryLabel`| string | No | The custom category name |
| `organizationWebsite`| string | No | Website URL |
| `logoUrl` | string | No | Avatar/Logo URL |
| `primaryContact.*` | object | No | Name, Email, Phone, Role |
| `billingDetails.*` | object | No | Tax ID, Address |

**Response:**
- `200 OK`: The updated Organizer profile object.
