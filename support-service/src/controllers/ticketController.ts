import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest, SUPPORT_EVENTS, TicketPriority } from '../types';
import { SupportTicket } from '../models/SupportTicket';
import { SupportMessage } from '../models/SupportMessage';
import { computeSLADeadline, isSLABreached, recalculateSLADeadline } from '../utils/slaEngine';
import { emitSupportEvent } from '../utils/eventEmitter';
import {
    createTicketSchema,
    updateStatusSchema,
    listTicketsQuerySchema,
} from '../utils/validators';

// ─── Create Ticket ───
export const createTicket = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = createTicketSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                meta: { status: 400, message: 'Validation error' },
                errors: parsed.error.issues,
            });
        }

        const data = parsed.data;
        const userId = req.user!.id;
        const userRole = req.user!.role as 'artist' | 'organizer';
        const priority = (data.priority || 'medium') as TicketPriority;

        // Compute SLA deadline
        const now = new Date();
        const slaDeadline = computeSLADeadline(priority, now);

        // Build related entity
        const relatedEntity = data.relatedEntity
            ? {
                type: data.relatedEntity.type,
                entityId: new mongoose.Types.ObjectId(data.relatedEntity.entityId),
            }
            : undefined;

        const ticket = await SupportTicket.create({
            userId: new mongoose.Types.ObjectId(userId),
            role: userRole,
            category: data.category,
            subcategory: data.subcategory,
            relatedEntity,
            priority,
            status: 'open',
            slaDeadline,
        });

        // Create the initial message on this ticket
        await SupportMessage.create({
            ticketId: ticket._id,
            senderType: 'user',
            senderId: new mongoose.Types.ObjectId(userId),
            message: data.message,
            attachments: [],
        });

        // Emit event
        await emitSupportEvent(SUPPORT_EVENTS.TICKET_CREATED, {
            ticketId: ticket._id,
            userId,
            category: ticket.category,
            priority: ticket.priority,
        });

        res.status(201).json({
            meta: { status: 201, message: 'Ticket created successfully' },
            data: ticket,
        });
    } catch (error: any) {
        console.error('createTicket error:', error);
        res.status(500).json({
            meta: { status: 500, message: 'Internal server error' },
            errors: [{ message: error.message }],
        });
    }
};

// ─── List Tickets (Admin / Agent Queue) ───
export const listTickets = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = listTicketsQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({
                meta: { status: 400, message: 'Invalid query params' },
                errors: parsed.error.issues,
            });
        }

        const { page, limit, status, priority, category, sort, order } = parsed.data;
        const skip = (page - 1) * limit;

        const filter: Record<string, any> = {};
        if (status) filter.status = status;
        if (priority) filter.priority = priority;
        if (category) filter.category = category;

        const sortObj: Record<string, 1 | -1> = {};
        if (sort === 'priority') {
            sortObj.priority = order === 'asc' ? 1 : -1;
        } else if (sort === 'slaDeadline') {
            sortObj.slaDeadline = 1;
        } else {
            sortObj.createdAt = order === 'asc' ? 1 : -1;
        }

        const [tickets, total] = await Promise.all([
            SupportTicket.find(filter).sort(sortObj).skip(skip).limit(limit).lean(),
            SupportTicket.countDocuments(filter),
        ]);

        res.json({
            meta: {
                status: 200,
                message: 'Tickets retrieved',
                pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
            },
            data: tickets,
        });
    } catch (error: any) {
        console.error('listTickets error:', error);
        res.status(500).json({
            meta: { status: 500, message: 'Internal server error' },
            errors: [{ message: error.message }],
        });
    }
};

// ─── My Tickets ───
export const getMyTickets = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;

        const filter = { userId: new mongoose.Types.ObjectId(userId) };

        const [tickets, total] = await Promise.all([
            SupportTicket.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            SupportTicket.countDocuments(filter),
        ]);

        res.json({
            meta: {
                status: 200,
                message: 'Your tickets retrieved',
                pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
            },
            data: tickets,
        });
    } catch (error: any) {
        console.error('getMyTickets error:', error);
        res.status(500).json({
            meta: { status: 500, message: 'Internal server error' },
            errors: [{ message: error.message }],
        });
    }
};

// ─── Get Ticket by ID ───
export const getTicketById = async (req: AuthRequest, res: Response) => {
    try {
        const ticket = await SupportTicket.findById(req.params.id).lean();
        if (!ticket) {
            return res.status(404).json({
                meta: { status: 404, message: 'Ticket not found' },
            });
        }

        // Access control: user sees own, admin/agent sees all
        const userId = req.user!.id;
        const role = req.user!.role;
        if (role !== 'admin' && role !== 'agent' && ticket.userId.toString() !== userId) {
            return res.status(403).json({
                meta: { status: 403, message: 'Forbidden' },
            });
        }

        res.json({
            meta: { status: 200, message: 'Ticket retrieved' },
            data: {
                ...ticket,
                slaBreached: isSLABreached(ticket.slaDeadline),
            },
        });
    } catch (error: any) {
        console.error('getTicketById error:', error);
        res.status(500).json({
            meta: { status: 500, message: 'Internal server error' },
            errors: [{ message: error.message }],
        });
    }
};

// ─── Update Ticket Status ───
export const updateTicketStatus = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = updateStatusSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                meta: { status: 400, message: 'Validation error' },
                errors: parsed.error.issues,
            });
        }

        const ticket = await SupportTicket.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({
                meta: { status: 404, message: 'Ticket not found' },
            });
        }

        // Block status change on closed tickets
        if (ticket.status === 'closed') {
            return res.status(403).json({
                meta: { status: 403, message: 'Cannot update a closed ticket' },
            });
        }

        const previousStatus = ticket.status;
        ticket.status = parsed.data.status;
        await ticket.save();

        await emitSupportEvent(SUPPORT_EVENTS.TICKET_STATUS_CHANGED, {
            ticketId: ticket._id,
            from: previousStatus,
            to: parsed.data.status,
            changedBy: req.user!.id,
        });

        res.json({
            meta: { status: 200, message: 'Ticket status updated' },
            data: ticket,
        });
    } catch (error: any) {
        console.error('updateTicketStatus error:', error);
        res.status(500).json({
            meta: { status: 500, message: 'Internal server error' },
            errors: [{ message: error.message }],
        });
    }
};

// ─── SLA Breached Tickets (Admin) ───
export const getSLABreached = async (_req: AuthRequest, res: Response) => {
    try {
        const now = new Date();
        const tickets = await SupportTicket.find({
            status: { $nin: ['resolved', 'closed'] },
            slaDeadline: { $lt: now },
        })
            .sort({ slaDeadline: 1 })
            .lean();

        res.json({
            meta: { status: 200, message: 'SLA breached tickets' },
            data: tickets,
            count: tickets.length,
        });
    } catch (error: any) {
        console.error('getSLABreached error:', error);
        res.status(500).json({
            meta: { status: 500, message: 'Internal server error' },
            errors: [{ message: error.message }],
        });
    }
};

// ─── Support Stats (Admin) ───
export const getSupportStats = async (_req: AuthRequest, res: Response) => {
    try {
        const [totalOpen, totalInReview, totalWaiting, totalResolved, totalClosed] = await Promise.all([
            SupportTicket.countDocuments({ status: 'open' }),
            SupportTicket.countDocuments({ status: 'in_review' }),
            SupportTicket.countDocuments({ status: 'waiting_user' }),
            SupportTicket.countDocuments({ status: 'resolved' }),
            SupportTicket.countDocuments({ status: 'closed' }),
        ]);

        res.json({
            meta: { status: 200, message: 'Support statistics' },
            data: { totalOpen, totalInReview, totalWaiting, totalResolved, totalClosed },
        });
    } catch (error: any) {
        console.error('getSupportStats error:', error);
        res.status(500).json({
            meta: { status: 500, message: 'Internal server error' },
            errors: [{ message: error.message }],
        });
    }
};
