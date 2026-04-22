/* ─────────────────────────────────────────────
 *  email.worker.ts
 *  Dedicated BullMQ Worker — consumes emailQueue jobs.
 *
 *  Design goals:
 *   ✓ Never crashes the process — all job errors are caught
 *   ✓ Retries 3× via queue defaultJobOptions (exp backoff)
 *   ✓ Logs every attempt, failure, and final exhaustion
 *   ✓ Clean start() / stop() lifecycle for server.ts
 * ───────────────────────────────────────────── */

import { Worker, Job, UnrecoverableError } from 'bullmq';
import { redisConnection, EmailJobData, EmailJobName, WelcomeEmailJob, PasswordResetEmailJob } from './email.queue';
import { emailService } from './email.service';
import { renderWelcomeEmail, renderPasswordResetEmail } from './email.templates';

const QUEUE_NAME = 'emailQueue';

/* ══════════════════════════════════════════
 *  JOB PROCESSOR
 *  Returning normally = success.
 *  Throwing = BullMQ marks job as failed and retries.
 *  Throwing UnrecoverableError = immediately move to failed (no retry).
 * ══════════════════════════════════════════ */

async function processEmailJob(job: Job<EmailJobData, void, EmailJobName>): Promise<void> {
    console.log(`[EmailWorker] ▶ Processing job "${job.name}" id=${job.id} attempt=${job.attemptsMade + 1}/3`);

    try {
        switch (job.name) {
            case 'welcome-email': {
                const { email, displayName, role = 'artist' } = job.data as WelcomeEmailJob;

                if (!email) {
                    // Bad data — retrying won't fix it
                    throw new UnrecoverableError(
                        `[EmailWorker] welcome-email job id=${job.id} has no email address`
                    );
                }

                const deepLinkUrl = process.env.APP_URL ?? 'https://app.netsa.in';
                const template = renderWelcomeEmail({ displayName, role, deepLinkUrl });

                await emailService.send({
                    to: email,
                    subject: template.subject,
                    html: template.html,
                    text: template.text,
                });

                console.log(`[EmailWorker] ✓ welcome-email sent to ${email} (userId=${job.data.userId})`);
                break;
            }

            case 'password-reset': {
                const { email, displayName, code } = job.data as PasswordResetEmailJob;

                if (!email || !code) {
                    throw new UnrecoverableError(
                        `[EmailWorker] password-reset job id=${job.id} missing email or code`
                    );
                }

                const template = renderPasswordResetEmail({ displayName, code });

                await emailService.send({
                    to: email,
                    subject: template.subject,
                    html: template.html,
                    text: template.text,
                });

                console.log(`[EmailWorker] ✓ password-reset email sent to ${email} (userId=${job.data.userId})`);
                break;
            }

            default: {
                // Unknown job type — no point retrying
                throw new UnrecoverableError(
                    `[EmailWorker] Unknown job name "${job.name}" — skipping without retry`
                );
            }
        }
    } catch (err: any) {
        // UnrecoverableError bubbles up unchanged (BullMQ won't retry)
        if (err instanceof UnrecoverableError) {
            console.error(`[EmailWorker] ✗ UNRECOVERABLE — ${err.message}`);
            throw err;
        }

        // Transient failure — log and re-throw so BullMQ retries
        const isLastAttempt = job.attemptsMade + 1 >= (job.opts?.attempts ?? 3);
        const level = isLastAttempt ? 'FINAL FAILURE' : 'retrying';

        console.error(
            `[EmailWorker] ✗ Job "${job.name}" id=${job.id} failed (${level}):`,
            err.message
        );

        throw err; // must rethrow — swallowing hides from BullMQ retry logic
    }
}

/* ══════════════════════════════════════════
 *  WORKER SINGLETON
 * ══════════════════════════════════════════ */

let worker: Worker<EmailJobData, void, EmailJobName> | null = null;

export function startEmailWorker(): void {
    if (worker) {
        console.log('[EmailWorker] Already running — skipping duplicate start');
        return;
    }

    worker = new Worker<EmailJobData, void, EmailJobName>(
        QUEUE_NAME,
        processEmailJob,
        {
            connection: redisConnection,
            concurrency: 5,
            // Stalled job detection: reclaim jobs that froze mid-processing
            stalledInterval: 30_000,
        }
    );

    /* ── Lifecycle events (never throw in these — would crash process) ── */

    worker.on('completed', (job) => {
        console.log(`[EmailWorker] ✓ Completed job "${job.name}" id=${job.id}`);
    });

    worker.on('failed', (job, err) => {
        const attemptsLeft = (job?.opts?.attempts ?? 3) - (job?.attemptsMade ?? 0);
        console.error(
            `[EmailWorker] ✗ Failed job "${job?.name}" id=${job?.id} ` +
            `| attemptsLeft=${attemptsLeft} | reason: ${err.message}`
        );
    });

    worker.on('error', (err) => {
        // Worker-level Redis / BullMQ errors — log, do NOT rethrow
        console.error('[EmailWorker] Worker error (non-fatal):', err.message);
    });

    worker.on('stalled', (jobId) => {
        console.warn(`[EmailWorker] Job ${jobId} stalled and will be requeued`);
    });

    console.log(`[EmailWorker] Started — listening on "${QUEUE_NAME}" (concurrency=5)`);
}

export async function stopEmailWorker(): Promise<void> {
    if (!worker) return;

    try {
        await worker.close();
        console.log('[EmailWorker] Stopped gracefully');
    } catch (err: any) {
        console.error('[EmailWorker] Error during shutdown:', err.message);
    } finally {
        worker = null;
    }
}
