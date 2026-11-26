// Cross-service call: hand a host's event announcement to users-service, which
// owns the notification pipeline (bell + socket). events-service owns the audience
// (registrations / waitlist), so it resolves the recipient ids here and posts the
// list; users-service fans out one in-app notification per attendee.
//
// Unlike followNotify (pure fire-and-forget), this RETURNS the outcome so the
// controller can tell the host the truth: if the token is unset (common in dev)
// or the call fails, we must NOT show "Sent ✓". A notification failure still never
// throws into the host's request — the worst case is an honest "couldn't notify".

const usersServiceUrl = () => process.env.USERS_SERVICE_URL || 'http://localhost:5001';

// Bound the call so the host's POST /notifications (axios 15s on the client) never
// hangs on a users-service cold start (~33s on Render free tier) → the host would
// see "Failed", retry, and create a duplicate announcement row.
const CALL_TIMEOUT_MS = 8000;

export interface EventAnnouncementPing {
    announcementId: string;   // the EventNotification row id (stable idempotency seed)
    organizerId: string;
    eventId: string;
    eventTitle: string;
    message: string;
    recipientIds: string[];
}

export type EventAnnouncementReason =
    | 'no_token'        // INTERNAL_SERVICE_TOKEN unset → cross-service calls are disabled
    | 'no_recipients'   // audience resolved to nobody
    | 'http_error'      // users-service answered non-2xx
    | 'timeout'         // users-service didn't answer in time
    | 'network';        // transport error

export interface EventAnnouncementResult {
    ok: boolean;        // true only when users-service accepted the fan-out (202)
    notified: number;   // recipients handed to the pipeline (0 unless ok)
    reason?: EventAnnouncementReason;
}

export async function notifyEventAnnouncement(
    input: EventAnnouncementPing,
): Promise<EventAnnouncementResult> {
    const token = process.env.INTERNAL_SERVICE_TOKEN || '';
    if (!token) return { ok: false, notified: 0, reason: 'no_token' };

    const recipientIds = Array.from(new Set((input.recipientIds || []).filter(Boolean).map(String)));
    if (recipientIds.length === 0) return { ok: false, notified: 0, reason: 'no_recipients' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
    const url = `${usersServiceUrl()}/internal/notifications/event-announcement`;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ ...input, recipientIds }),
            signal: controller.signal,
        });
        if (res.status === 202 || res.ok) {
            const data = (await res.json().catch(() => null)) as { notified?: number } | null;
            const notified = typeof data?.notified === 'number' ? data.notified : recipientIds.length;
            return { ok: true, notified };
        }
        console.warn('[eventAnnounce] users-service returned', res.status);
        return { ok: false, notified: 0, reason: 'http_error' };
    } catch (err: any) {
        const reason: EventAnnouncementReason = err?.name === 'AbortError' ? 'timeout' : 'network';
        console.warn('[eventAnnounce] ping failed:', reason, err?.message || err);
        return { ok: false, notified: 0, reason };
    } finally {
        clearTimeout(timer);
    }
}
