import { TicketPriority, SLA_MATRIX } from '../types';

/**
 * Compute slaDeadline based on ticket priority.
 */
export function computeSLADeadline(
    priority: TicketPriority,
    createdAt: Date = new Date()
): Date {
    const config = SLA_MATRIX[priority];
    return new Date(createdAt.getTime() + config.responseHours * 60 * 60 * 1000);
}

/**
 * Check if SLA has been breached for a ticket.
 */
export function isSLABreached(slaDeadline: Date): boolean {
    return new Date() > slaDeadline;
}

/**
 * Recalculate SLA deadline when priority changes.
 */
export function recalculateSLADeadline(
    newPriority: TicketPriority,
    createdAt: Date
): Date {
    return computeSLADeadline(newPriority, createdAt);
}
