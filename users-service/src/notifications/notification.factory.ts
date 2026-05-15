/**
 * Notification Factory
 * 
 * Converts domain events into notification payloads.
 * This is a pure transformation layer that does NOT interact with the database.
 * 
 * Responsibilities:
 * - Transform event payloads into user-facing notification content
 * - Generate title and body text
 * - Determine delivery channels (inApp, push, email, sms)
 * - Build deep-linking data for mobile navigation
 * 
 * Design principles:
 * - Pure functions: no side effects, no DB access
 * - User-centric: notifications are addressed to specific users
 * - Context-aware: channel selection based on notification type and urgency
 */

import { Types } from 'mongoose';
import {
    NotificationEvent,
    ConnectionRequestedEvent,
    ConnectionAcceptedEvent,
    MessageSentEvent,
    GigApplicationReceivedEvent,
    GigApplicationViewedEvent,
    GigApplicationStatusChangedEvent,
    GigCancelledEvent,
    EventRegistrationCompletedEvent,
    EventReservationExpiringEvent,
    EventCancelledEvent,
    EventUpdatedEvent,
    PaymentCompletedEvent,
    PaymentFailedEvent,
    ContractSentEvent,
    ContractSignedEvent,
    ProfileViewedEvent,
} from './notification.events';
import {
    NotificationType,
    ConnectionSubtype,
    MessageSubtype,
    GigSubtype,
    EventSubtype,
    PaymentSubtype,
    ContractSubtype,
    ProfileSubtype,
} from './notification.types';
import { INotificationChannel, INotificationData } from './notification.model';

/**
 * Notification payload ready to be saved to database
 */
export interface NotificationPayload {
    userId: Types.ObjectId;
    actorId?: Types.ObjectId;
    type: NotificationType;
    subtype: string;
    title: string;
    body: string;
    entityType?: 'gig' | 'event' | 'conversation' | 'contract';
    entityId?: Types.ObjectId;
    data?: INotificationData;
    channel: INotificationChannel;
}

/**
 * Notification Factory Class
 * Converts domain events into notification payloads
 */
class NotificationFactory {
    /**
     * Main entry point: convert any notification event into notification payloads
     * Returns an array because some events create multiple notifications (e.g., message to multiple recipients)
     */
    createFromEvent(event: NotificationEvent): NotificationPayload[] {
        switch (event.eventName) {
            case 'connection.requested':
                return this.createConnectionRequested(event);
            case 'connection.accepted':
                return this.createConnectionAccepted(event);
            case 'message.sent':
                return this.createMessageSent(event);
            case 'gig.application.received':
                return this.createGigApplicationReceived(event);
            case 'gig.application.viewed':
                return this.createGigApplicationViewed(event);
            case 'gig.application.status.changed':
                return this.createGigApplicationStatusChanged(event);
            case 'gig.cancelled':
                return this.createGigCancelled(event);
            case 'profile.viewed':
                return this.createProfileViewed(event);
            case 'event.registration.completed':
                return this.createEventRegistrationCompleted(event);
            case 'event.reservation.expiring':
                return this.createEventReservationExpiring(event);
            case 'event.cancelled':
                return this.createEventCancelled(event);
            case 'event.updated':
                return this.createEventUpdated(event);
            case 'payment.completed':
                return this.createPaymentCompleted(event);
            case 'payment.failed':
                return this.createPaymentFailed(event);
            case 'contract.sent':
                return this.createContractSent(event);
            case 'contract.signed':
                return this.createContractSigned(event);
            default:
                console.warn('[NotificationFactory] Unknown event type:', (event as any).eventName);
                return [];
        }
    }

    // ============================================================================
    // CONNECTION NOTIFICATIONS
    // ============================================================================

    private createConnectionRequested(event: ConnectionRequestedEvent): NotificationPayload[] {
        return [{
            userId: event.payload.recipientId,
            actorId: event.payload.actorId,
            type: NotificationType.CONNECTION,
            subtype: ConnectionSubtype.REQUEST,
            title: 'New Connection Request',
            body: event.payload.message || 'Someone wants to connect with you',
            entityType: undefined,
            entityId: event.payload.connectionId,
            data: {
                route: 'connections',
                params: {
                    connectionId: event.payload.connectionId.toString(),
                },
            },
            channel: {
                inApp: true,
                push: true,
                email: false,
                sms: false,
            },
        }];
    }

    private createConnectionAccepted(event: ConnectionAcceptedEvent): NotificationPayload[] {
        return [{
            userId: event.payload.recipientId,
            actorId: event.payload.actorId,
            type: NotificationType.CONNECTION,
            subtype: ConnectionSubtype.ACCEPTED,
            title: 'Connection Accepted',
            body: 'Your connection request was accepted. Start chatting now!',
            entityType: 'conversation',
            entityId: event.payload.conversationId,
            data: {
                route: 'chat',
                params: {
                    conversationId: event.payload.conversationId.toString(),
                },
            },
            channel: {
                inApp: true,
                push: true,
                email: false,
                sms: false,
            },
        }];
    }

    // ============================================================================
    // MESSAGE NOTIFICATIONS
    // ============================================================================

    private createMessageSent(event: MessageSentEvent): NotificationPayload[] {
        // Create one notification per recipient
        return event.payload.recipientIds.map(recipientId => ({
            userId: recipientId,
            actorId: event.payload.senderId,
            type: NotificationType.MESSAGE,
            subtype: MessageSubtype.NEW,
            title: 'New Message',
            body: event.payload.messagePreview,
            entityType: 'conversation' as const,
            entityId: event.payload.conversationId,
            data: {
                route: 'chat',
                params: {
                    conversationId: event.payload.conversationId.toString(),
                },
            },
            channel: {
                inApp: true,
                // Push only if recipient is offline (this logic should be in the consumer)
                // For now, we'll set push to true and let the consumer decide
                push: true,
                email: false,
                sms: false,
            },
        }));
    }

    // ============================================================================
    // GIG NOTIFICATIONS
    // ============================================================================

    private createGigApplicationReceived(event: GigApplicationReceivedEvent): NotificationPayload[] {
        return [{
            userId: event.payload.gigOwnerId,
            actorId: event.payload.applicantId,
            type: NotificationType.GIG,
            subtype: GigSubtype.APPLICATION_RECEIVED,
            title: 'New Gig Application',
            body: `Someone applied to your gig "${event.payload.gigTitle}"`,
            entityType: 'gig',
            entityId: event.payload.gigId,
            data: {
                route: 'gig-applications',
                params: {
                    gigId: event.payload.gigId.toString(),
                    applicationId: event.payload.applicationId.toString(),
                },
            },
            channel: {
                inApp: true,
                push: true,
                email: false,
                sms: false,
            },
        }];
    }

    private createGigApplicationViewed(event: GigApplicationViewedEvent): NotificationPayload[] {
        return [{
            userId: event.payload.applicantId,
            actorId: event.payload.gigOwnerId,
            type: NotificationType.GIG,
            subtype: GigSubtype.APPLICATION_VIEWED,
            title: 'Hirer viewed your application',
            body: `Your application for "${event.payload.gigTitle}" was just opened by the hirer.`,
            entityType: 'gig',
            entityId: event.payload.gigId,
            data: {
                route: 'gig-details',
                params: {
                    gigId: event.payload.gigId.toString(),
                },
            },
            // Plan 5 — view-tracking is informational, not transactional.
            //   • inApp     — yes (notification center is the right home)
            //   • push      — yes (artists love this signal — drives re-engagement)
            //   • email     — no (too spammy if hirer browses many candidates)
            //   • sms / wa  — no (cost > signal)
            channel: {
                inApp: true,
                push: true,
                email: false,
                whatsapp: false,
                sms: false,
            },
        }];
    }

    private createProfileViewed(event: ProfileViewedEvent): NotificationPayload[] {
        const ctx = event.payload.viewerArtistType
            ? `${event.payload.viewerDisplayName}, ${event.payload.viewerArtistType}`
            : event.payload.viewerDisplayName;

        return [{
            userId: event.payload.profileOwnerId,
            actorId: event.payload.viewerId,
            type: NotificationType.PROFILE,
            subtype: ProfileSubtype.VIEWED,
            title: 'Someone viewed your profile',
            body: `${ctx} just viewed your profile.`,
            // No entityType because the "entity" is the owner's own profile;
            // route lands them on the viewer's profile so they can connect.
            data: {
                route: 'profile',
                params: {
                    userId: event.payload.viewerId.toString(),
                },
            },
            // Plan 5 — light social-proof loop. inApp + push only.
            //   • email     — no (LinkedIn-style; nudge inside the app, don't intrude)
            //   • sms / wa  — no (cost > signal)
            channel: {
                inApp: true,
                push: true,
                email: false,
                whatsapp: false,
                sms: false,
            },
        }];
    }

    private createGigApplicationStatusChanged(event: GigApplicationStatusChangedEvent): NotificationPayload[] {
        const { newStatus, gigTitle } = event.payload;

        let subtype: string;
        let title: string;
        let body: string;

        switch (newStatus) {
            case 'shortlisted':
                subtype = GigSubtype.APPLICATION_SHORTLISTED;
                title = 'Application Shortlisted';
                body = `Great news! You've been shortlisted for "${gigTitle}"`;
                break;
            case 'hired':
                subtype = GigSubtype.APPLICATION_HIRED;
                title = 'Congratulations! You Got the Gig';
                body = `You've been hired for "${gigTitle}"`;
                break;
            case 'rejected':
                subtype = GigSubtype.APPLICATION_REJECTED;
                title = 'Application Update';
                body = `Your application for "${gigTitle}" was not selected this time`;
                break;
            default:
                // Should not happen, but handle gracefully
                return [];
        }

        return [{
            userId: event.payload.applicantId,
            actorId: event.payload.gigOwnerId,
            type: NotificationType.GIG,
            subtype,
            title,
            body,
            entityType: 'gig',
            entityId: event.payload.gigId,
            data: {
                route: 'gig-details',
                params: {
                    gigId: event.payload.gigId.toString(),
                },
            },
            // Plan 5 — application status changes are high-signal moments.
            // Fan out across every channel we have so the artist hears about
            // it whether they're online, offline, or away from the app.
            //   • inApp     — always: notification center + badge
            //   • push      — always: FCM/APNs lock-screen alert
            //   • email     — always: transactional email with deep link
            //   • whatsapp  — always: India-first nudge via MSG91 WA Business
            //   • sms       — only on `hired`: high-cost, reserved for the
            //                  most important transition. (Producer-paid
            //                  channel; cheap-skating on shortlist/reject.)
            channel: {
                inApp: true,
                push: true,
                email: true,
                whatsapp: true,
                sms: newStatus === 'hired',
            },
        }];
    }

    private createGigCancelled(event: GigCancelledEvent): NotificationPayload[] {
        // Create one notification per applicant
        return event.payload.applicantIds.map(applicantId => ({
            userId: applicantId,
            actorId: event.payload.gigOwnerId,
            type: NotificationType.GIG,
            subtype: GigSubtype.GIG_CANCELLED,
            title: 'Gig Cancelled',
            body: `The gig "${event.payload.gigTitle}" has been cancelled${event.payload.cancellationReason ? `: ${event.payload.cancellationReason}` : ''
                }`,
            entityType: 'gig' as const,
            entityId: event.payload.gigId,
            data: {
                route: 'gig-details',
                params: {
                    gigId: event.payload.gigId.toString(),
                },
            },
            channel: {
                inApp: true,
                push: true,
                email: true, // Important update, send email
                sms: false,
            },
        }));
    }

    // ============================================================================
    // EVENT NOTIFICATIONS
    // ============================================================================

    private createEventRegistrationCompleted(event: EventRegistrationCompletedEvent): NotificationPayload[] {
        return [{
            userId: event.payload.userId,
            actorId: undefined,
            type: NotificationType.EVENT,
            subtype: EventSubtype.REGISTRATION_SUCCESS,
            title: 'Registration Confirmed',
            body: `You're registered for "${event.payload.eventTitle}"! ${event.payload.ticketCount} ticket(s) confirmed.`,
            entityType: 'event',
            entityId: event.payload.eventId,
            data: {
                route: 'event-details',
                params: {
                    eventId: event.payload.eventId.toString(),
                    registrationId: event.payload.registrationId.toString(),
                },
            },
            channel: {
                inApp: true,
                push: true,
                email: true, // Send confirmation email
                sms: false,
            },
        }];
    }

    private createEventReservationExpiring(event: EventReservationExpiringEvent): NotificationPayload[] {
        return [{
            userId: event.payload.userId,
            actorId: undefined,
            type: NotificationType.EVENT,
            subtype: EventSubtype.RESERVATION_EXPIRING,
            title: 'Reservation Expiring Soon',
            body: `Your reservation for "${event.payload.eventTitle}" expires in ${event.payload.minutesRemaining} minutes. Complete payment now!`,
            entityType: 'event',
            entityId: event.payload.eventId,
            data: {
                route: 'event-checkout',
                params: {
                    eventId: event.payload.eventId.toString(),
                    reservationId: event.payload.reservationId.toString(),
                },
            },
            channel: {
                inApp: true,
                push: true, // Urgent, send push
                email: false,
                sms: false,
            },
        }];
    }

    private createEventCancelled(event: EventCancelledEvent): NotificationPayload[] {
        // Create one notification per registered user
        return event.payload.registeredUserIds.map(userId => ({
            userId: userId,
            actorId: event.payload.organizerId,
            type: NotificationType.EVENT,
            subtype: EventSubtype.CANCELLED,
            title: 'Event Cancelled',
            body: `"${event.payload.eventTitle}" has been cancelled${event.payload.refundAmount ? `. Refund of ₹${event.payload.refundAmount} will be processed.` : ''
                }`,
            entityType: 'event' as const,
            entityId: event.payload.eventId,
            data: {
                route: 'event-details',
                params: {
                    eventId: event.payload.eventId.toString(),
                },
            },
            channel: {
                inApp: true,
                push: true,
                email: true, // Important update, send email
                sms: false,
            },
        }));
    }

    private createEventUpdated(event: EventUpdatedEvent): NotificationPayload[] {
        // Create one notification per registered user
        return event.payload.registeredUserIds.map(userId => ({
            userId: userId,
            actorId: event.payload.organizerId,
            type: NotificationType.EVENT,
            subtype: EventSubtype.UPDATED,
            title: 'Event Updated',
            body: `"${event.payload.eventTitle}" has been updated. Check the latest details.`,
            entityType: 'event' as const,
            entityId: event.payload.eventId,
            data: {
                route: 'event-details',
                params: {
                    eventId: event.payload.eventId.toString(),
                },
            },
            channel: {
                inApp: true,
                push: true,
                email: false,
                sms: false,
            },
        }));
    }

    // ============================================================================
    // PAYMENT NOTIFICATIONS
    // ============================================================================

    private createPaymentCompleted(event: PaymentCompletedEvent): NotificationPayload[] {
        return [{
            userId: event.payload.userId,
            actorId: undefined,
            type: NotificationType.PAYMENT,
            subtype: PaymentSubtype.SUCCESS,
            title: 'Payment Successful',
            body: `Your payment of ₹${event.payload.amount} was successful`,
            entityType: event.payload.entityId ? this.getEntityTypeFromPurpose(event.payload.purpose) : undefined,
            entityId: event.payload.entityId,
            data: {
                route: 'payment-receipt',
                params: {
                    paymentId: event.payload.paymentId.toString(),
                    transactionId: event.payload.transactionId,
                },
            },
            channel: {
                inApp: true,
                push: true,
                email: true, // Send receipt via email
                sms: false,
            },
        }];
    }

    private createPaymentFailed(event: PaymentFailedEvent): NotificationPayload[] {
        return [{
            userId: event.payload.userId,
            actorId: undefined,
            type: NotificationType.PAYMENT,
            subtype: PaymentSubtype.FAILED,
            title: 'Payment Failed',
            body: `Payment of ₹${event.payload.amount} failed: ${event.payload.failureReason}`,
            entityType: event.payload.entityId ? this.getEntityTypeFromPurpose(event.payload.purpose) : undefined,
            entityId: event.payload.entityId,
            data: {
                route: 'payment-retry',
                params: {
                    paymentId: event.payload.paymentId.toString(),
                },
            },
            channel: {
                inApp: true,
                push: true,
                email: true, // Notify via email
                sms: false,
            },
        }];
    }

    // ============================================================================
    // CONTRACT NOTIFICATIONS
    // ============================================================================

    private createContractSent(event: ContractSentEvent): NotificationPayload[] {
        return [{
            userId: event.payload.recipientId,
            actorId: event.payload.senderId,
            type: NotificationType.CONTRACT,
            subtype: ContractSubtype.SENT,
            title: 'New Contract',
            body: `You have a new contract to review: "${event.payload.contractTitle}"`,
            entityType: 'contract',
            entityId: event.payload.contractId,
            data: {
                route: 'contract-details',
                params: {
                    contractId: event.payload.contractId.toString(),
                    gigId: event.payload.gigId?.toString(),
                },
            },
            channel: {
                inApp: true,
                push: true,
                email: true, // Important legal document, send email
                sms: false,
            },
        }];
    }

    private createContractSigned(event: ContractSignedEvent): NotificationPayload[] {
        return [{
            userId: event.payload.recipientId,
            actorId: event.payload.signerId,
            type: NotificationType.CONTRACT,
            subtype: ContractSubtype.SIGNED,
            title: 'Contract Signed',
            body: `"${event.payload.contractTitle}" has been signed`,
            entityType: 'contract',
            entityId: event.payload.contractId,
            data: {
                route: 'contract-details',
                params: {
                    contractId: event.payload.contractId.toString(),
                    gigId: event.payload.gigId?.toString(),
                },
            },
            channel: {
                inApp: true,
                push: true,
                email: true, // Important legal document, send email
                sms: false,
            },
        }];
    }

    // ============================================================================
    // HELPER METHODS
    // ============================================================================

    private getEntityTypeFromPurpose(purpose: string): 'gig' | 'event' | 'conversation' | 'contract' | undefined {
        switch (purpose) {
            case 'event_registration':
                return 'event';
            case 'gig_contract':
                return 'gig';
            default:
                return undefined;
        }
    }
}

// Export singleton instance
export const notificationFactory = new NotificationFactory();

// ============================================================================
// PLAN 6 — EVENTS-SERVICE CROSS-SERVICE CHANNEL FLAGS
// ============================================================================

import { EventCrossServiceSubtype } from './notification.types';

/**
 * Channel flags for each event cross-service subtype.
 * Determines which delivery adapters fire for each notification.
 * push=true fires FCM/APNs; email fires SES; whatsapp fires MSG91 WA
 * (templates must be pre-approved by Meta — founder responsibility §25.7);
 * inapp always writes to the InAppNotification collection.
 */
export const EVENT_CHANNEL_FLAGS: Record<
    EventCrossServiceSubtype,
    { push: boolean; email: boolean; whatsapp: boolean; inapp: boolean; sms: boolean }
> = {
    'event.new_from_followed_organizer': { push: true,  email: false, whatsapp: false, inapp: true,  sms: false },
    'event.first_registration_ever':     { push: true,  email: false, whatsapp: false, inapp: true,  sms: false },
    'event.new_registration':            { push: false, email: false, whatsapp: false, inapp: true,  sms: false }, // digest path
    'event.registration_confirmed':      { push: true,  email: true,  whatsapp: false, inapp: true,  sms: false },
    'event.reminder_24h':                { push: true,  email: false, whatsapp: true,  inapp: true,  sms: false },
    'event.reminder_2h':                 { push: true,  email: false, whatsapp: false, inapp: true,  sms: false },
    'event.capacity_urgency':            { push: true,  email: false, whatsapp: false, inapp: true,  sms: false },
    'event.cancelled':                   { push: true,  email: true,  whatsapp: true,  inapp: true,  sms: false },
    'event.rescheduled':                 { push: true,  email: true,  whatsapp: true,  inapp: true,  sms: false },
    'event.mark_attendees_prompt':       { push: true,  email: false, whatsapp: false, inapp: true,  sms: false },
    'event.payment_captured':            { push: true,  email: true,  whatsapp: false, inapp: true,  sms: false },
    'event.payment_failed':              { push: true,  email: false, whatsapp: false, inapp: true,  sms: false },
};
