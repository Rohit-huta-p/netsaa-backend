/**
 * SMS Notification Service
 *
 * Adapter-pattern stub for SMS delivery. Default provider in production
 * will be MSG91's transactional SMS route (already in the stack for OTP).
 * Until MSG91_AUTH_KEY + sender ID are wired, the mock provider logs
 * and returns success.
 *
 * SMS is the most expensive channel — factory only flags `sms: true`
 * for the highest-signal events (e.g. application HIRED). Other gig
 * status changes leave it false.
 */

import { Types } from 'mongoose';

export interface SmsPayload {
    userId: Types.ObjectId | string;
    /** Resolved at call time from User.phoneNumber; included for logging. */
    to?: string;
    /** ≤160 chars per SMS segment; provider may concat. */
    body: string;
    /**
     * Notification type (e.g. 'gig.application.hired') — used to pick a
     * pre-approved DLT template ID on MSG91.
     */
    notificationType?: string;
}

export interface SmsDeliveryResult {
    success: boolean;
    messageId?: string;
    error?: string;
    provider: string;
}

export interface ISmsProvider {
    /** Provider tag — 'msg91' | 'twilio' | 'mock' */
    name: string;
    send(payload: SmsPayload): Promise<SmsDeliveryResult>;
}

class MockSmsProvider implements ISmsProvider {
    public readonly name = 'mock';

    async send(payload: SmsPayload): Promise<SmsDeliveryResult> {
        console.log('[sms:mock] would send', {
            to: payload.to ?? `user:${payload.userId}`,
            preview: payload.body.slice(0, 60),
            type: payload.notificationType,
        });
        return {
            success: true,
            messageId: `mock-${Date.now()}`,
            provider: this.name,
        };
    }
}

class SmsNotificationService {
    private provider: ISmsProvider;

    constructor(provider?: ISmsProvider) {
        this.provider = provider ?? new MockSmsProvider();
    }

    setProvider(provider: ISmsProvider): void {
        this.provider = provider;
    }

    async send(payload: SmsPayload): Promise<SmsDeliveryResult> {
        return this.provider.send(payload);
    }
}

export const smsNotificationService = new SmsNotificationService();
