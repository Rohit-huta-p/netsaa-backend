// Best-effort cross-service ping: tell users-service that an organizer just
// published a gig, so it can notify that organizer's followers. users-service
// owns the Follow collection and the notification fan-out, so gigs-service only
// forwards the "who posted what" signal.
//
// Fire-and-forget: this never throws and must never block or fail a publish.

const usersServiceUrl = () => process.env.USERS_SERVICE_URL || 'http://localhost:5001';

export interface FolloweePostedPing {
    organizerId: string;
    kind: 'gig' | 'event';
    entityId: string;
    title: string;
    actorName?: string;
}

export async function notifyFollowersOfPost(input: FolloweePostedPing): Promise<void> {
    const token = process.env.INTERNAL_SERVICE_TOKEN || '';
    if (!token) return; // not configured → skip silently (notifications are best-effort)

    const url = `${usersServiceUrl()}/internal/notifications/followee-posted`;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(input),
        });
        if (!res.ok && res.status !== 202) {
            console.warn('[followNotify] users-service returned', res.status);
        }
    } catch (err: any) {
        // A notification failure must never surface to the organizer publishing a gig.
        console.warn('[followNotify] ping failed:', err?.message || err);
    }
}
