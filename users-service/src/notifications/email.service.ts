/**
 * Email Notification Service
 *
 * Adapter-pattern stub for transactional email delivery (gig status,
 * payment receipts, contract events). Real provider (SES / SendGrid /
 * Mailgun) plugs in via IEmailProvider.
 *
 * Same shape as push.service.ts so the worker can iterate channels
 * uniformly. Until EMAIL_PROVIDER + creds are configured, the default
 * MockEmailProvider just logs the would-be send and returns success
 * — that lets us exercise the worker fan-out path in tests without
 * needing real keys.
 */

import { Types } from 'mongoose';

export interface EmailPayload {
    userId: Types.ObjectId | string;
    /** Resolved at call time from User.email; included for logging. */
    to?: string;
    subject: string;
    /** Plain-text or simple HTML body. Templating handled by provider. */
    body: string;
    /**
     * Deep-link URL for a CTA button if the provider's template supports it.
     * Format: `https://netsa.app/{route}?{params}`
     */
    ctaUrl?: string;
    /**
     * Notification type (e.g. 'gig.application.hired') — providers can
     * map this to a transactional template ID.
     */
    notificationType?: string;
}

export interface EmailDeliveryResult {
    success: boolean;
    messageId?: string;
    error?: string;
    provider: string;
}

export interface IEmailProvider {
    /** Provider tag — 'ses' | 'sendgrid' | 'mailgun' | 'mock' */
    name: string;
    send(payload: EmailPayload): Promise<EmailDeliveryResult>;
}

/**
 * Mock provider — logs the send and pretends success. Used in dev/tests
 * until SES_ACCESS_KEY (or SENDGRID_API_KEY) is wired into env.
 */
class MockEmailProvider implements IEmailProvider {
    public readonly name = 'mock';

    async send(payload: EmailPayload): Promise<EmailDeliveryResult> {
        console.log('[email:mock] would send', {
            to: payload.to ?? `user:${payload.userId}`,
            subject: payload.subject,
            type: payload.notificationType,
        });
        return {
            success: true,
            messageId: `mock-${Date.now()}`,
            provider: this.name,
        };
    }
}

class EmailNotificationService {
    private provider: IEmailProvider;

    constructor(provider?: IEmailProvider) {
        // TODO: when EMAIL_PROVIDER=ses (or sendgrid) is set in env, swap
        // in the real adapter here. For now mock-only.
        this.provider = provider ?? new MockEmailProvider();
    }

    setProvider(provider: IEmailProvider): void {
        this.provider = provider;
    }

    async send(payload: EmailPayload): Promise<EmailDeliveryResult> {
        return this.provider.send(payload);
    }
}

export const emailNotificationService = new EmailNotificationService();
