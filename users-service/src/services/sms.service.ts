import axios from 'axios';

// ==========================================
// 1. Dependency Injection Abstraction Layer
// ==========================================
export interface ISmsProvider {
    /**
     * Send an SMS to the specified phone number.
     * @param phone E.164 formatted phone number.
     * @param message Text message content.
     * @returns boolean true if successfully queued/sent.
     */
    sendSms(phone: string, message: string): Promise<boolean>;
}

// ==========================================
// 2. Concrete Strategy: Fast2SMS Provider
// ==========================================
export class Fast2SmsProvider implements ISmsProvider {
    private apiKey: string;

    constructor() {
        this.apiKey = process.env.FAST2SMS_API_KEY || '';

        if (!this.apiKey) {
            console.warn('[Fast2SmsProvider] API key is not set in environment (FAST2SMS_API_KEY)');
        }
    }

    async sendSms(phone: string, message: string): Promise<boolean> {
        try {
            if (!this.apiKey) {
                console.warn('[Fast2SmsProvider] Credentials missing. Simulating SMS send...');
                console.log(`\n\x1b[36m[SIMULATED SMS]\x1b[0m\nTo: ${phone}\nContent: ${message}\n`);
                return true;
            }

            // Remove non-numeric characters for Fast2SMS (expects mostly 10-digit Indian numbers)
            let formattedPhone = phone.replace(/\D/g, '');
            if (formattedPhone.length > 10 && formattedPhone.startsWith('91')) {
                formattedPhone = formattedPhone.slice(2);
            }

            const response = await axios.post('https://www.fast2sms.com/dev/bulkV2', {
                route: 'q',
                message: message,
                language: 'english',
                flash: 0,
                numbers: formattedPhone,
            }, {
                headers: {
                    'authorization': this.apiKey,
                    'Content-Type': 'application/json'
                }
            });

            if (response.data && response.data.return === true) {
                console.log(`[Fast2SmsProvider] SMS sent successfully to ${phone}`);
                return true;
            } else {
                console.error(`[Fast2SmsProvider] SMS API returned error:`, response.data);
                return false;
            }
        } catch (error: any) {
            console.error('[Fast2SmsProvider] Error sending SMS:', error.response?.data || error.message || error);
            return false;
        }
    }
}

// ==========================================
// 3. Central Service (Context)
// ==========================================
export class SmsService {
    private provider: ISmsProvider;

    constructor(provider: ISmsProvider) {
        this.provider = provider;
    }

    /**
     * Sets a new provider at runtime if needed
     */
    public setProvider(provider: ISmsProvider): void {
        this.provider = provider;
    }

    /**
     * Send an SMS using the injected provider.
     * Centralizes logging and generic validation.
     */
    async sendSms(phone: string, message: string): Promise<boolean> {
        if (!phone || !message) {
            console.error('[SmsService] Phone number and message body are both required.');
            return false;
        }

        return await this.provider.sendSms(phone, message);
    }
}

// ==========================================
// 4. Default Exports
// ==========================================

// Initialize with Fast2SMS integration
const defaultProvider = new Fast2SmsProvider();
export const smsService = new SmsService(defaultProvider);

/**
 * Functional wrapper for immediate drop-in usage across controllers
 */
export const sendSms = async (phone: string, message: string): Promise<boolean> => {
    return await smsService.sendSms(phone, message);
};
