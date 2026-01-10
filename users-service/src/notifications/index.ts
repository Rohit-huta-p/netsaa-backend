/**
 * Notifications Module Exports
 * 
 * Central export point for all notification-related types, models, and utilities.
 * This allows other services to import from a single location.
 */

// Model
export { default as Notification } from './notification.model';
export type { INotification, INotificationChannel, INotificationData, EntityType } from './notification.model';

// Types and Constants
export {
    NotificationType,
    ConnectionSubtype,
    MessageSubtype,
    GigSubtype,
    EventSubtype,
    PaymentSubtype,
    ContractSubtype,
    SystemSubtype,
    ALL_NOTIFICATION_SUBTYPES,
    getNotificationTypeFromSubtype,
} from './notification.types';
export type { NotificationSubtype } from './notification.types';

// Event Contracts
export {
    NotificationEventNames,
    generateIdempotencyKey,
} from './notification.events';
export type {
    BaseNotificationEvent,
    NotificationEvent,
    NotificationEventName,
    ConnectionRequestedEvent,
    ConnectionAcceptedEvent,
    MessageSentEvent,
    GigApplicationReceivedEvent,
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
} from './notification.events';

// Event Emitter
export { notificationEvents } from './event.emitter';

// Notification Factory
export { notificationFactory } from './notification.factory';
export type { NotificationPayload } from './notification.factory';

// Notification Service
export { notificationService } from './notification.service';
export type { NotificationQueryOptions, PaginatedNotifications } from './notification.service';

// Notification Worker
export { notificationWorker, startNotificationWorker, stopNotificationWorker } from './notification.worker';

// Push Notification Service
export { pushNotificationService } from './push.service';

export type { IPushProvider, PushNotificationPayload, PushNotificationResult, QuietHours } from './push.service';
