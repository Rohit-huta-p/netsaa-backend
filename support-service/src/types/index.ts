import { Request } from 'express';
import mongoose from 'mongoose';

// ─── Auth Request (extends Express Request with JWT payload) ───
export interface AuthRequest extends Request {
    user?: {
        id: string;
        role: UserRole;
        [key: string]: any;
    };
}

export type UserRole = 'artist' | 'organizer' | 'admin' | 'agent';

// ─── Ticket Types ───
export type TicketCategory = 'payment' | 'gig' | 'event' | 'account' | 'safety' | 'technical';

export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';

export type TicketStatus = 'open' | 'in_review' | 'waiting_user' | 'resolved' | 'closed';

export type RelatedEntityType = 'gig' | 'event' | 'conversation' | 'contract' | 'payment';

export type SenderType = 'user' | 'admin';

// ─── SLA Config ───
export interface SLAConfig {
    responseHours: number;
}

export const SLA_MATRIX: Record<TicketPriority, SLAConfig> = {
    low: { responseHours: 72 },
    medium: { responseHours: 48 },
    high: { responseHours: 24 },
    critical: { responseHours: 4 },
};

// ─── Support Event Names ───
export const SUPPORT_EVENTS = {
    TICKET_CREATED: 'support.ticket.created',
    TICKET_STATUS_CHANGED: 'support.ticket.status_changed',
    TICKET_ESCALATED: 'support.ticket.escalated',
    TICKET_CLOSED: 'support.ticket.closed',
    MESSAGE_CREATED: 'support.message.created',
} as const;
