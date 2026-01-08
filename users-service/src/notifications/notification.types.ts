/**
 * Notification Types and Subtypes
 * 
 * This file defines all notification types and subtypes used across the NETSA platform.
 * These constants ensure consistency across services and prevent typos.
 * 
 * Design principles:
 * - Types are broad categories (connection, message, gig, event, system)
 * - Subtypes are specific events within each category
 * - Use dot notation for subtypes (e.g., 'connection.request')
 * - All subtypes are immutable constants for type safety
 */

/**
 * Primary notification categories
 */
export enum NotificationType {
    CONNECTION = 'connection',
    MESSAGE = 'message',
    GIG = 'gig',
    EVENT = 'event',
    PAYMENT = 'payment',
    CONTRACT = 'contract',
    SYSTEM = 'system',
}

/**
 * Notification subtypes organized by category
 * These represent specific events that trigger notifications
 */

// Connection-related notifications
export const ConnectionSubtype = {
    REQUEST: 'connection.request',           // Someone sent you a connection request
    ACCEPTED: 'connection.accepted',         // Your connection request was accepted
    REJECTED: 'connection.rejected',         // Your connection request was rejected (optional)
} as const;

// Message-related notifications
export const MessageSubtype = {
    NEW: 'message.new',                      // New message received in a conversation
    MENTION: 'message.mention',              // You were mentioned in a message (future)
} as const;

// Gig-related notifications
export const GigSubtype = {
    APPLICATION_RECEIVED: 'gig.application.received',     // Gig owner: New application received
    APPLICATION_SHORTLISTED: 'gig.application.shortlisted', // Applicant: You were shortlisted
    APPLICATION_HIRED: 'gig.application.hired',           // Applicant: You were hired
    APPLICATION_REJECTED: 'gig.application.rejected',     // Applicant: Application rejected (optional)
    DEADLINE_APPROACHING: 'gig.deadline.approaching',     // Gig owner: Application deadline approaching
    GIG_CANCELLED: 'gig.cancelled',                       // Applicants: Gig was cancelled
} as const;

// Event-related notifications
export const EventSubtype = {
    REGISTRATION_SUCCESS: 'event.registration.success',   // Successfully registered for event
    RESERVATION_EXPIRING: 'event.reservation.expiring',   // Ticket reservation about to expire
    RESERVATION_EXPIRED: 'event.reservation.expired',     // Ticket reservation expired
    CANCELLED: 'event.cancelled',                         // Event was cancelled
    REMINDER: 'event.reminder',                           // Event is coming up soon
    UPDATED: 'event.updated',                             // Event details changed
} as const;

// Payment-related notifications
export const PaymentSubtype = {
    SUCCESS: 'payment.success',              // Payment completed successfully
    FAILED: 'payment.failed',                // Payment failed
    REFUND_INITIATED: 'payment.refund.initiated',  // Refund has been initiated
    REFUND_COMPLETED: 'payment.refund.completed',  // Refund completed
} as const;

// Contract-related notifications
export const ContractSubtype = {
    SENT: 'contract.sent',                   // Contract sent to you
    SIGNED: 'contract.signed',               // Contract was signed by other party
    EXPIRED: 'contract.expired',             // Contract expired without signing
    CANCELLED: 'contract.cancelled',         // Contract was cancelled
} as const;

// System-related notifications
export const SystemSubtype = {
    ALERT: 'system.alert',                   // General system alert
    MAINTENANCE: 'system.maintenance',       // Scheduled maintenance notification
    FEATURE_ANNOUNCEMENT: 'system.feature.announcement', // New feature announcement
    POLICY_UPDATE: 'system.policy.update',   // Terms/privacy policy update
} as const;

/**
 * Union type of all possible notification subtypes
 * This ensures type safety when creating notifications
 */
export type NotificationSubtype =
    | typeof ConnectionSubtype[keyof typeof ConnectionSubtype]
    | typeof MessageSubtype[keyof typeof MessageSubtype]
    | typeof GigSubtype[keyof typeof GigSubtype]
    | typeof EventSubtype[keyof typeof EventSubtype]
    | typeof PaymentSubtype[keyof typeof PaymentSubtype]
    | typeof ContractSubtype[keyof typeof ContractSubtype]
    | typeof SystemSubtype[keyof typeof SystemSubtype];

/**
 * Helper to get all subtypes as an array (useful for validation)
 */
export const ALL_NOTIFICATION_SUBTYPES = [
    ...Object.values(ConnectionSubtype),
    ...Object.values(MessageSubtype),
    ...Object.values(GigSubtype),
    ...Object.values(EventSubtype),
    ...Object.values(PaymentSubtype),
    ...Object.values(ContractSubtype),
    ...Object.values(SystemSubtype),
] as const;

/**
 * Map notification subtype to its primary type
 * Useful for categorizing notifications
 */
export function getNotificationTypeFromSubtype(subtype: NotificationSubtype): NotificationType {
    if (subtype.startsWith('connection.')) return NotificationType.CONNECTION;
    if (subtype.startsWith('message.')) return NotificationType.MESSAGE;
    if (subtype.startsWith('gig.')) return NotificationType.GIG;
    if (subtype.startsWith('event.')) return NotificationType.EVENT;
    if (subtype.startsWith('payment.')) return NotificationType.PAYMENT;
    if (subtype.startsWith('contract.')) return NotificationType.CONTRACT;
    if (subtype.startsWith('system.')) return NotificationType.SYSTEM;

    throw new Error(`Unknown notification subtype: ${subtype}`);
}
