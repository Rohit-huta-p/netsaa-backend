import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest, SUPPORT_EVENTS } from '../types';
import { SupportEscalation } from '../models/SupportEscalation';
import { SupportTicket } from '../models/SupportTicket';
import { emitSupportEvent } from '../utils/eventEmitter';
import { escalateTicketSchema } from '../utils/validators';

// ─── Escalate Ticket ───
export const escalateTicket = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = escalateTicketSchema.safeParse(req.body);
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

        if (ticket.status === 'closed') {
            return res.status(403).json({
                meta: { status: 403, message: 'Cannot escalate a closed ticket' },
            });
        }

        const escalation = await SupportEscalation.create({
            ticketId: ticket._id,
            escalatedTo: new mongoose.Types.ObjectId(parsed.data.escalatedTo),
            reason: parsed.data.reason,
        });

        await emitSupportEvent(SUPPORT_EVENTS.TICKET_ESCALATED, {
            ticketId: ticket._id,
            escalatedTo: parsed.data.escalatedTo,
            reason: parsed.data.reason,
        });

        res.status(201).json({
            meta: { status: 201, message: 'Ticket escalated' },
            data: escalation,
        });
    } catch (error: any) {
        console.error('escalateTicket error:', error);
        res.status(500).json({
            meta: { status: 500, message: 'Internal server error' },
            errors: [{ message: error.message }],
        });
    }
};

// ─── Get Escalation History ───
export const getEscalationHistory = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const ticket = await SupportTicket.findById(id).select('_id').lean();
        if (!ticket) {
            return res.status(404).json({
                meta: { status: 404, message: 'Ticket not found' },
            });
        }

        const escalations = await SupportEscalation.find({
            ticketId: new mongoose.Types.ObjectId(id as string),
        })
            .sort({ createdAt: -1 })
            .lean();

        res.json({
            meta: { status: 200, message: 'Escalation history retrieved' },
            data: escalations,
        });
    } catch (error: any) {
        console.error('getEscalationHistory error:', error);
        res.status(500).json({
            meta: { status: 500, message: 'Internal server error' },
            errors: [{ message: error.message }],
        });
    }
};
