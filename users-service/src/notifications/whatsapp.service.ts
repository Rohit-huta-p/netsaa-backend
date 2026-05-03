/**
 * WhatsApp Notification Service
 *
 * India-first delivery channel. Default provider in production will be
 * MSG91's WhatsApp Business route (Meta-approved templates). Same
 * adapter pattern as email/sms/push so the worker can iterate channels
 * uniformly. Until MSG91_WA_AUTH_KEY + namespace + template IDs are
 * wired, the mock provider logs and returns success.
 *
 * Why WhatsApp matters for NETSA: Indian artists check WhatsApp dozens
 * of times per day; many treat email as low-priority and may have push
 * notifications muted. WA gets the message through reliably and the
 * cost-per-message is competitive with SMS.
 */

import { Types } from 'mongoose';

export interface WhatsAppPayload {
    userId: Types.ObjectId | string;
    /** Resolved at call time from User.phoneNumber (E.164 format). */
    to?: string;
    /**
     * Pre-approved template name (Meta WA Business policy: free-form
     * messages only allowed within 24h of user-initiated contact, so
     * notification deliveries always go through templates).
     */
    templateName: string;
    /** Variables that fill the template's {{1}}, {{2}}, ... placeholders. */
    templateVars?: string[];
    /**
     * Notification type — kept for parity with the email/sms shape and
     * useful for analytics dashboards.
     */
    notificationType?: string;
    /** Optional CTA URL (becomes a button in the WA message). */
    ctaUrl?: string;
}

export interface WhatsAppDeliveryResult {
    success: boolean;
    messageId?: string;
    error?: string;
    provider: string;
}

export interface IWhatsAppProvider {
    /** Provider tag — 'msg91' | 'gupshup' | 'twilio' | 'mock' */
    name: string;
    send(payload: WhatsAppPayload): Promise<WhatsAppDeliveryResult>;
}

class MockWhatsAppProvider implements IWhatsAppProvider {
    public readonly name = 'mock';

    async send(payload: WhatsAppPayload): Promise<WhatsAppDeliveryResult> {
        console.log('[whatsapp:mock] would send', {
            to: payload.to ?? `user:${payload.userId}`,
            template: payload.templateName,
            vars: payload.templateVars,
            type: payload.notificationType,
        });
        return {
            success: true,
            messageId: `mock-${Date.now()}`,
            provider: this.name,
        };
    }
}

class WhatsAppNotificationService {
    private provider: IWhatsAppProvider;

    constructor(provider?: IWhatsAppProvider) {
        this.provider = provider ?? new MockWhatsAppProvider();
    }

    setProvider(provider: IWhatsAppProvider): void {
        this.provider = provider;
    }

    async send(payload: WhatsAppPayload): Promise<WhatsAppDeliveryResult> {
        return this.provider.send(payload);
    }
}

export const whatsappNotificationService = new WhatsAppNotificationService();
