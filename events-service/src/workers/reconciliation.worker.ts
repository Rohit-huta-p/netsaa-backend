import cron from 'node-cron';
import { detectAndFixDrift } from '../services/reconciliation.service';

/**
 * Reconciliation cron — runs daily at 4am IST (= 22:30 UTC).
 *
 * Schedule: '30 22 * * *' (daily at 22:30 UTC)
 *
 * Heals capacity.registeredCount drift caused by failed compensation in the
 * registration insert path. Logs and alerts if drift exceeds 1% of events.
 */
export function startReconciliationWorker() {
    cron.schedule('30 22 * * *', async () => {
        console.log('[reconciliation] starting nightly drift check');
        try {
            const result = await detectAndFixDrift();
            console.log('[reconciliation] complete', result);

            if (result.alertWorthy) {
                // TODO Plan 6 follow-up: wire to alert pipeline (PagerDuty/Slack)
                console.error('[reconciliation] ALERT: drift exceeds 1% of events', result);
            }
        } catch (err) {
            console.error('[reconciliation] FAILED', err);
        }
    }, {
        timezone: 'UTC',
    });

    console.log('[reconciliation] worker scheduled (daily at 22:30 UTC = 4am IST)');
}
