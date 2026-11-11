// HTTP client for forwarding notification events to users-service's BullMQ queue.
// gigs-service does not share Redis with users-service, so it cannot write to
// the queue directly. Instead it POSTs the full event over the internal HTTP API.
//
// Fire-and-forget by convention: callers must not await the returned Promise.

const usersServiceUrl = () => process.env.USERS_SERVICE_URL || 'http://localhost:5001';

export interface GigNotificationEvent {
    eventName: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
}

export async function enqueueNotificationEvent(event: GigNotificationEvent): Promise<void> {
    const token = process.env.INTERNAL_SERVICE_TOKEN || '';
    if (!token) {
        console.warn('[NotificationClient] INTERNAL_SERVICE_TOKEN not set — skipping notification');
        return;
    }
    const url = `${usersServiceUrl()}/internal/notifications/enqueue`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(event),
    });
    if (!res.ok) {
        throw new Error(`notification enqueue failed: HTTP ${res.status}`);
    }
}
