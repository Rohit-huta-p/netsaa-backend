/**
 * Notification Event Contracts
 * 
 * This file defines the event-driven contract layer for notifications.
 * Events are emitted by business logic across services and consumed by the notification system.
 * 
 * Design principles:
 * - Events are the ONLY way to trigger notifications
 * - Each event has a strict payload shape for type safety
 * - Idempotency keys prevent duplicate notifications
 * - Events are domain-specific, notifications are user-facing
 * - Services emit events, notification system handles delivery
 */

import { Types } from 'mongoose';

/**
 * Base interface for all notification events
 * All events must include an idempotency key to prevent duplicates
 */
export interface BaseNotificationEvent {
    /**
     * Unique identifier for this event instance
     * Used to prevent duplicate notification creation
     * Format: `{eventName}:{entityId}:{timestamp}` or similar
     */
    idempotencyKey: string;
}

// ============================================================================
// CONNECTION EVENTS
// ============================================================================

/**
 * Emitted when a user sends a connection request to another user
 * 
 * Triggers notification to: recipientId
 * Notification type: connection.request
 */
export interface ConnectionRequestedEvent extends BaseNotificationEvent {
    eventName: 'connection.requested';
    payload: {
        recipientId: Types.ObjectId;      // User receiving the connection request
        actorId: Types.ObjectId;          // User who sent the request
        connectionId: Types.ObjectId;     // Connection document ID
        message?: string;                 // Optional message from requester
    };
}

/**
 * Emitted when a user accepts a connection request
 * 
 * Triggers notification to: requesterId (original requester)
 * Notification type: connection.accepted
 */
export interface ConnectionAcceptedEvent extends BaseNotificationEvent {
    eventName: 'connection.accepted';
    payload: {
        recipientId: Types.ObjectId;      // User who will receive notification (original requester)
        actorId: Types.ObjectId;          // User who accepted the request
        connectionId: Types.ObjectId;     // Connection document ID
        conversationId: Types.ObjectId;   // Newly created conversation ID
    };
}

// ============================================================================
// MESSAGE EVENTS
// ============================================================================

/**
 * Emitted when a new message is sent in a conversation
 * 
 * Triggers notification to: all conversation participants except sender
 * Notification type: message.new
 */
export interface MessageSentEvent extends BaseNotificationEvent {
    eventName: 'message.sent';
    payload: {
        conversationId: Types.ObjectId;   // Conversation ID
        messageId: Types.ObjectId;        // Message document ID
        senderId: Types.ObjectId;         // User who sent the message
        recipientIds: Types.ObjectId[];   // Users who should receive notification
        messagePreview: string;           // First 100 chars of message text
        hasAttachments: boolean;          // Whether message has attachments
    };
}

// ============================================================================
// GIG EVENTS
// ============================================================================

/**
 * Emitted when someone applies to a gig
 * 
 * Triggers notification to: gig owner
 * Notification type: gig.application.received
 */
export interface GigApplicationReceivedEvent extends BaseNotificationEvent {
    eventName: 'gig.application.received';
    payload: {
        gigId: Types.ObjectId;            // Gig document ID
        applicationId: Types.ObjectId;    // Application document ID
        gigOwnerId: Types.ObjectId;       // User who created the gig (receives notification)
        applicantId: Types.ObjectId;      // User who applied
        gigTitle: string;                 // Gig title for notification text
    };
}

/**
 * Emitted when a gig application status changes (shortlisted, hired, rejected)
 * 
 * Triggers notification to: applicant
 * Notification type: varies based on newStatus
 */
export interface GigApplicationStatusChangedEvent extends BaseNotificationEvent {
    eventName: 'gig.application.status.changed';
    payload: {
        gigId: Types.ObjectId;            // Gig document ID
        applicationId: Types.ObjectId;    // Application document ID
        applicantId: Types.ObjectId;      // User who applied (receives notification)
        gigOwnerId: Types.ObjectId;       // User who changed the status
        gigTitle: string;                 // Gig title for notification text
        oldStatus: 'pending' | 'shortlisted' | 'hired' | 'rejected';
        newStatus: 'pending' | 'shortlisted' | 'hired' | 'rejected';
    };
}

/**
 * Emitted when a gig is cancelled by the owner
 * 
 * Triggers notification to: all applicants
 * Notification type: gig.cancelled
 */
export interface GigCancelledEvent extends BaseNotificationEvent {
    eventName: 'gig.cancelled';
    payload: {
        gigId: Types.ObjectId;            // Gig document ID
        gigOwnerId: Types.ObjectId;       // User who cancelled the gig
        gigTitle: string;                 // Gig title for notification text
        applicantIds: Types.ObjectId[];   // All users who applied (receive notifications)
        cancellationReason?: string;      // Optional reason for cancellation
    };
}

// ============================================================================
// EVENT EVENTS
// ============================================================================

/**
 * Emitted when a user successfully completes event registration and payment
 * 
 * Triggers notification to: registrant
 * Notification type: event.registration.success
 */
export interface EventRegistrationCompletedEvent extends BaseNotificationEvent {
    eventName: 'event.registration.completed';
    payload: {
        eventId: Types.ObjectId;          // Event document ID
        registrationId: Types.ObjectId;   // Registration document ID
        userId: Types.ObjectId;           // User who registered (receives notification)
        eventTitle: string;               // Event title for notification text
        eventStartDate: Date;             // Event start date
        ticketCount: number;              // Number of tickets purchased
        totalAmount: number;              // Total payment amount
    };
}

/**
 * Emitted when a ticket reservation is about to expire (e.g., 5 minutes before)
 * 
 * Triggers notification to: user who made the reservation
 * Notification type: event.reservation.expiring
 */
export interface EventReservationExpiringEvent extends BaseNotificationEvent {
    eventName: 'event.reservation.expiring';
    payload: {
        eventId: Types.ObjectId;          // Event document ID
        reservationId: Types.ObjectId;    // Reservation document ID
        userId: Types.ObjectId;           // User who made reservation (receives notification)
        eventTitle: string;               // Event title for notification text
        expiresAt: Date;                  // Reservation expiration timestamp
        minutesRemaining: number;         // Minutes until expiration
        ticketCount: number;              // Number of reserved tickets
    };
}

/**
 * Emitted when an event is cancelled by the organizer
 * 
 * Triggers notification to: all registered users
 * Notification type: event.cancelled
 */
export interface EventCancelledEvent extends BaseNotificationEvent {
    eventName: 'event.cancelled';
    payload: {
        eventId: Types.ObjectId;          // Event document ID
        organizerId: Types.ObjectId;      // User who cancelled the event
        eventTitle: string;               // Event title for notification text
        registeredUserIds: Types.ObjectId[]; // All registered users (receive notifications)
        cancellationReason?: string;      // Optional reason for cancellation
        refundAmount?: number;            // Refund amount if applicable
    };
}

/**
 * Emitted when event details are updated (date, location, etc.)
 * 
 * Triggers notification to: all registered users
 * Notification type: event.updated
 */
export interface EventUpdatedEvent extends BaseNotificationEvent {
    eventName: 'event.updated';
    payload: {
        eventId: Types.ObjectId;          // Event document ID
        organizerId: Types.ObjectId;      // User who updated the event
        eventTitle: string;               // Event title for notification text
        registeredUserIds: Types.ObjectId[]; // All registered users (receive notifications)
        updatedFields: string[];          // Fields that were updated (e.g., ['startDate', 'location'])
    };
}

// ============================================================================
// PAYMENT EVENTS
// ============================================================================

/**
 * Emitted when a payment is successfully processed
 * 
 * Triggers notification to: payer
 * Notification type: payment.success
 */
export interface PaymentCompletedEvent extends BaseNotificationEvent {
    eventName: 'payment.completed';
    payload: {
        paymentId: Types.ObjectId;        // Payment document ID
        userId: Types.ObjectId;           // User who made payment (receives notification)
        amount: number;                   // Payment amount
        currency: string;                 // Currency code (e.g., 'USD', 'INR')
        purpose: 'event_registration' | 'gig_contract' | 'other'; // Payment purpose
        entityId?: Types.ObjectId;        // Related entity ID (event, gig, etc.)
        transactionId: string;            // External payment gateway transaction ID
    };
}

/**
 * Emitted when a payment fails
 * 
 * Triggers notification to: payer
 * Notification type: payment.failed
 */
export interface PaymentFailedEvent extends BaseNotificationEvent {
    eventName: 'payment.failed';
    payload: {
        paymentId: Types.ObjectId;        // Payment document ID
        userId: Types.ObjectId;           // User whose payment failed (receives notification)
        amount: number;                   // Payment amount
        currency: string;                 // Currency code
        purpose: 'event_registration' | 'gig_contract' | 'other';
        entityId?: Types.ObjectId;        // Related entity ID
        failureReason: string;            // Reason for failure
    };
}

// ============================================================================
// CONTRACT EVENTS
// ============================================================================

/**
 * Emitted when a contract is sent to a user
 * 
 * Triggers notification to: recipient
 * Notification type: contract.sent
 */
export interface ContractSentEvent extends BaseNotificationEvent {
    eventName: 'contract.sent';
    payload: {
        contractId: Types.ObjectId;       // Contract document ID
        recipientId: Types.ObjectId;      // User receiving contract (receives notification)
        senderId: Types.ObjectId;         // User who sent the contract
        gigId?: Types.ObjectId;           // Related gig ID if applicable
        contractTitle: string;            // Contract title/description
        expiresAt?: Date;                 // Contract expiration date
    };
}

/**
 * Emitted when a contract is signed by a party
 * 
 * Triggers notification to: other party (sender)
 * Notification type: contract.signed
 */
export interface ContractSignedEvent extends BaseNotificationEvent {
    eventName: 'contract.signed';
    payload: {
        contractId: Types.ObjectId;       // Contract document ID
        recipientId: Types.ObjectId;      // User who should receive notification (original sender)
        signerId: Types.ObjectId;         // User who signed the contract
        gigId?: Types.ObjectId;           // Related gig ID if applicable
        contractTitle: string;            // Contract title/description
        signedAt: Date;                   // Timestamp of signing
    };
}

// ============================================================================
// UNION TYPE FOR ALL EVENTS
// ============================================================================

/**
 * Union type of all notification events
 * Use this for type-safe event handling
 */
export type NotificationEvent =
    | ConnectionRequestedEvent
    | ConnectionAcceptedEvent
    | MessageSentEvent
    | GigApplicationReceivedEvent
    | GigApplicationStatusChangedEvent
    | GigCancelledEvent
    | EventRegistrationCompletedEvent
    | EventReservationExpiringEvent
    | EventCancelledEvent
    | EventUpdatedEvent
    | PaymentCompletedEvent
    | PaymentFailedEvent
    | ContractSentEvent
    | ContractSignedEvent;

/**
 * Event names as a union type for validation
 */
export type NotificationEventName = NotificationEvent['eventName'];

/**
 * Helper to generate idempotency keys
 * Format: {eventName}:{primaryEntityId}:{timestamp}
 */
export function generateIdempotencyKey(
    eventName: NotificationEventName,
    primaryEntityId: Types.ObjectId | string,
    timestamp: Date = new Date()
): string {
    return `${eventName}:${primaryEntityId.toString()}:${timestamp.getTime()}`;
}

/**
 * Event name constants for easy reference
 */
export const NotificationEventNames = {
    CONNECTION_REQUESTED: 'connection.requested' as const,
    CONNECTION_ACCEPTED: 'connection.accepted' as const,
    MESSAGE_SENT: 'message.sent' as const,
    GIG_APPLICATION_RECEIVED: 'gig.application.received' as const,
    GIG_APPLICATION_STATUS_CHANGED: 'gig.application.status.changed' as const,
    GIG_CANCELLED: 'gig.cancelled' as const,
    EVENT_REGISTRATION_COMPLETED: 'event.registration.completed' as const,
    EVENT_RESERVATION_EXPIRING: 'event.reservation.expiring' as const,
    EVENT_CANCELLED: 'event.cancelled' as const,
    EVENT_UPDATED: 'event.updated' as const,
    PAYMENT_COMPLETED: 'payment.completed' as const,
    PAYMENT_FAILED: 'payment.failed' as const,
    CONTRACT_SENT: 'contract.sent' as const,
    CONTRACT_SIGNED: 'contract.signed' as const,
} as const;
