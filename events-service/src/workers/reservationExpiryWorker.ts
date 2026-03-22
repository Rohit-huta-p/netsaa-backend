import cron, { ScheduledTask } from 'node-cron';
import EventReservation from '../models/EventReservation';

const CRON_SCHEDULE = '*/60 * * * * *'; // Every 60 seconds
let isRunning = false;

async function expireStaleReservations(): Promise<void> {
    if (isRunning) return; // Guard against overlapping runs
    isRunning = true;

    try {
        const now = new Date();

        const result = await EventReservation.updateMany(
            { status: 'reserved', expiresAt: { $lt: now } },
            { $set: { status: 'expired' } }
        );

        if (result.modifiedCount > 0) {
            console.log(`[ReservationExpiryWorker] Expired ${result.modifiedCount} reservation(s)`);
        }
    } catch (error) {
        console.error('[ReservationExpiryWorker] Error expiring reservations:', error);
    } finally {
        isRunning = false;
    }
}

export function startReservationExpiryWorker(): ScheduledTask {
    console.log('[ReservationExpiryWorker] Starting — runs every 60s');

    const task = cron.schedule(CRON_SCHEDULE, expireStaleReservations);

    // Run once immediately on startup to clear any backlog
    expireStaleReservations();

    return task;
}
