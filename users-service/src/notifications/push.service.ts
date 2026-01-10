/**
 * Push Notification Service
 * 
 * Handles sending push notifications to mobile devices.
 * Uses adapter pattern to support multiple providers (FCM, APNs, OneSignal, etc.)
 * 
 * Responsibilities:
 * - Send push notifications via configured provider
 * - Respect user quiet hours
 * - Support deep linking via data payload
 * - Log all delivery attempts
 * - Handle failures gracefully
 * 
 * Design principles:
 * - Provider-agnostic: uses adapter pattern
 * - Best-effort: failures don't affect core functionality
 * - Privacy-aware: respects quiet hours
 * - Traceable: logs all attempts
 */

import { Types } from 'mongoose';

/**
 * Push notification payload
 */
export interface PushNotificationPayload {
    userId: Types.ObjectId | string;
    title: string;
    body: string;
    data?: {
        route?: string;
        params?: Record<string, any>;
        notificationId?: string;
        [key: string]: any;
    };
    badge?: number;
    sound?: string;
    priority?: 'high' | 'normal';
}

/**
 * Push notification result
 */
export interface PushNotificationResult {
    success: boolean;
    messageId?: string;
    error?: string;
    provider: string;
}

/**
 * Push provider adapter interface
 * Implement this interface for each push notification provider
 */
export interface IPushProvider {
    /**
     * Provider name (e.g., 'fcm', 'apns', 'onesignal')
     */
    name: string;

    /**
     * Send push notification to a user
     * @param deviceToken - User's device token
     * @param payload - Notification payload
     * @returns Result of the push operation
     */
    send(deviceToken: string, payload: PushNotificationPayload): Promise<PushNotificationResult>;

    /**
     * Send push notification to multiple devices
     * @param deviceTokens - Array of device tokens
     * @param payload - Notification payload
     * @returns Array of results
     */
    sendMultiple(deviceTokens: string[], payload: PushNotificationPayload): Promise<PushNotificationResult[]>;
}

/**
 * Mock Push Provider (for development)
 * Replace with real provider in production
 */
class MockPushProvider implements IPushProvider {
    name = 'mock';

    async send(deviceToken: string, payload: PushNotificationPayload): Promise<PushNotificationResult> {
        console.log('[MockPushProvider] Sending push notification:', {
            deviceToken: deviceToken.substring(0, 20) + '...',
            title: payload.title,
            body: payload.body,
            data: payload.data,
        });

        // Simulate success
        return {
            success: true,
            messageId: `mock_${Date.now()}`,
            provider: this.name,
        };
    }

    async sendMultiple(deviceTokens: string[], payload: PushNotificationPayload): Promise<PushNotificationResult[]> {
        return Promise.all(deviceTokens.map(token => this.send(token, payload)));
    }
}

/**
 * Firebase Cloud Messaging (FCM) Provider
 * Uncomment and configure when ready to use
 */
/*
import admin from 'firebase-admin';

class FCMPushProvider implements IPushProvider {
    name = 'fcm';
    
    constructor() {
        // Initialize Firebase Admin SDK
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FCM_PROJECT_ID,
                    clientEmail: process.env.FCM_CLIENT_EMAIL,
                    privateKey: process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n'),
                }),
            });
        }
    }

    async send(deviceToken: string, payload: PushNotificationPayload): Promise<PushNotificationResult> {
        try {
            const message: admin.messaging.Message = {
                token: deviceToken,
                notification: {
                    title: payload.title,
                    body: payload.body,
                },
                data: payload.data ? this.serializeData(payload.data) : undefined,
                apns: {
                    payload: {
                        aps: {
                            badge: payload.badge,
                            sound: payload.sound || 'default',
                        },
                    },
                },
                android: {
                    priority: payload.priority || 'high',
                    notification: {
                        sound: payload.sound || 'default',
                    },
                },
            };

            const messageId = await admin.messaging().send(message);

            return {
                success: true,
                messageId,
                provider: this.name,
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                provider: this.name,
            };
        }
    }

    async sendMultiple(deviceTokens: string[], payload: PushNotificationPayload): Promise<PushNotificationResult[]> {
        try {
            const message: admin.messaging.MulticastMessage = {
                tokens: deviceTokens,
                notification: {
                    title: payload.title,
                    body: payload.body,
                },
                data: payload.data ? this.serializeData(payload.data) : undefined,
            };

            const response = await admin.messaging().sendMulticast(message);

            return response.responses.map((resp, index) => ({
                success: resp.success,
                messageId: resp.messageId,
                error: resp.error?.message,
                provider: this.name,
            }));
        } catch (error) {
            return deviceTokens.map(() => ({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                provider: this.name,
            }));
        }
    }

    private serializeData(data: any): Record<string, string> {
        const serialized: Record<string, string> = {};
        for (const [key, value] of Object.entries(data)) {
            serialized[key] = typeof value === 'string' ? value : JSON.stringify(value);
        }
        return serialized;
    }
}
*/

/**
 * Quiet hours configuration
 */
export interface QuietHours {
    enabled: boolean;
    startHour: number; // 0-23
    endHour: number; // 0-23
    timezone?: string;
}

/**
 * Push Notification Service
 */
class PushNotificationService {
    private provider: IPushProvider;
    private quietHours: QuietHours;

    constructor(provider?: IPushProvider) {
        // Use provided provider or default to mock
        this.provider = provider || new MockPushProvider();

        // Default quiet hours: 10 PM to 8 AM
        this.quietHours = {
            enabled: false, // Disabled by default
            startHour: 22,
            endHour: 8,
        };

        console.log(`[PushNotificationService] Initialized with provider: ${this.provider.name}`);
    }

    /**
     * Set push notification provider
     */
    setProvider(provider: IPushProvider): void {
        this.provider = provider;
        console.log(`[PushNotificationService] Provider changed to: ${provider.name}`);
    }

    /**
     * Configure quiet hours
     */
    setQuietHours(config: QuietHours): void {
        this.quietHours = config;
    }

    /**
     * Send push notification to a user
     * 
     * @param deviceToken - User's device token
     * @param payload - Notification payload
     * @param options - Additional options
     * @returns Result of the push operation
     */
    async send(
        deviceToken: string,
        payload: PushNotificationPayload,
        options?: {
            ignoreQuietHours?: boolean;
        }
    ): Promise<PushNotificationResult> {
        try {
            // Check quiet hours
            if (!options?.ignoreQuietHours && this.isQuietHours()) {
                console.log('[PushNotificationService] Skipping push - quiet hours active');
                return {
                    success: false,
                    error: 'Quiet hours active',
                    provider: this.provider.name,
                };
            }

            // Log attempt
            console.log('[PushNotificationService] Sending push notification:', {
                userId: payload.userId,
                title: payload.title,
                provider: this.provider.name,
            });

            // Send via provider
            const result = await this.provider.send(deviceToken, payload);

            // Log result
            if (result.success) {
                console.log('[PushNotificationService] Push sent successfully:', {
                    messageId: result.messageId,
                    userId: payload.userId,
                });
            } else {
                console.error('[PushNotificationService] Push failed:', {
                    error: result.error,
                    userId: payload.userId,
                });
            }

            return result;

        } catch (error) {
            // Log error but don't throw
            console.error('[PushNotificationService] Error sending push:', {
                error: error instanceof Error ? error.message : error,
                userId: payload.userId,
            });

            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                provider: this.provider.name,
            };
        }
    }

    /**
     * Send push notification to multiple devices
     * 
     * @param deviceTokens - Array of device tokens
     * @param payload - Notification payload
     * @param options - Additional options
     * @returns Array of results
     */
    async sendMultiple(
        deviceTokens: string[],
        payload: PushNotificationPayload,
        options?: {
            ignoreQuietHours?: boolean;
        }
    ): Promise<PushNotificationResult[]> {
        try {
            // Check quiet hours
            if (!options?.ignoreQuietHours && this.isQuietHours()) {
                console.log('[PushNotificationService] Skipping push - quiet hours active');
                return deviceTokens.map(() => ({
                    success: false,
                    error: 'Quiet hours active',
                    provider: this.provider.name,
                }));
            }

            // Log attempt
            console.log('[PushNotificationService] Sending push to multiple devices:', {
                deviceCount: deviceTokens.length,
                userId: payload.userId,
                title: payload.title,
            });

            // Send via provider
            const results = await this.provider.sendMultiple(deviceTokens, payload);

            // Log summary
            const successCount = results.filter(r => r.success).length;
            console.log('[PushNotificationService] Batch push completed:', {
                total: results.length,
                successful: successCount,
                failed: results.length - successCount,
            });

            return results;

        } catch (error) {
            console.error('[PushNotificationService] Error sending batch push:', error);

            return deviceTokens.map(() => ({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                provider: this.provider.name,
            }));
        }
    }

    /**
     * Check if current time is within quiet hours
     * 
     * @returns True if quiet hours are active
     */
    private isQuietHours(): boolean {
        if (!this.quietHours.enabled) {
            return false;
        }

        const now = new Date();
        const currentHour = now.getHours();

        const { startHour, endHour } = this.quietHours;

        // Handle overnight quiet hours (e.g., 22:00 to 08:00)
        if (startHour > endHour) {
            return currentHour >= startHour || currentHour < endHour;
        }

        // Handle same-day quiet hours (e.g., 13:00 to 14:00)
        return currentHour >= startHour && currentHour < endHour;
    }

    /**
     * Get current provider name
     */
    getProviderName(): string {
        return this.provider.name;
    }
}

// Export singleton instance
export const pushNotificationService = new PushNotificationService();
