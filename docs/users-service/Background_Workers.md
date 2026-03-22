# Background Workers & Jobs

> Scripts and asynchronous workers handling out-of-band processing for the `users-service`.

## Overview

Background workers handle logic that is too slow, complex, or disruptive to manage synchronously within an Express.js HTTP request cycle. They operate outside the standard event loop of client requests.

---

## 1. `migrateOldDeletedUsers.ts`

### Purpose
A dedicated migration script to transition legacy soft-deleted accounts into the newer "tombstone" format, ensuring emails are anonymized (`deleted_user@net.sa`) and GDPR/privacy constraints are met.

### Execution
This script is run manually (or via a deployment hook) rather than continuously inside the main service loop.
```bash
npx ts-node src/workers/migrateOldDeletedUsers.ts
```

### Flow
1. **Connects** to MongoDB.
2. **Queries** `User` collection for legacy soft-deleted users (where `deletedAt` exists, but the email has not been anonymized and `accountStatus` is not `scheduled_for_deletion`).
3. **Generates** a tombstone email string (e.g., `deleted_5f1a5..._167891234@deleted.netsa`).
4. **Updates** the `User` document:
   - Moves actual email to `originalEmail` (for potential recovery or audit before hard deletion).
   - Replaces `email` with the tombstone string.
   - Sets `accountStatus` to `permanently_deleted`.
5. **Logs** migration statistics and affected user IDs to stdout.

---

> **Note on Future Workers:**
> As NETSA scales, additional scheduled jobs (e.g., cron workers via `node-cron` or `bullmq`) will be added to this directory. A primary upcoming use case is scanning `deletionScheduledAt` dates to physically purge user data after the 30-day grace period expires.
