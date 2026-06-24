import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest, SUPPORT_EVENTS } from '../types';
import { SupportMessage } from '../models/SupportMessage';
import { SupportTicket } from '../models/SupportTicket';
import { emitSupportEvent } from '../utils/eventEmitter';
import { createMessageSchema } from '../utils/validators';

// ─── Add Message to Ticket ───
export const addMessage = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = createMessageSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                meta: { status: 400, message: 'Validation error' },
                errors: parsed.error.issues,
            });
        }

        const ticketId = req.params.id;

        // Verify ticket exists and is not closed
        const ticket = await SupportTicket.findById(ticketId).select('userId status').lean();
        if (!ticket) {
            return res.status(404).json({
                meta: { status: 404, message: 'Ticket not found' },
            });
        }
        if (ticket.status === 'closed') {
            return res.status(403).json({
                meta: { status: 403, message: 'Cannot add messages to a closed ticket' },
            });
        }

        const userId = req.user!.id;
        const role = req.user!.role;
        const senderType = role === 'admin' || role === 'agent' ? 'admin' : 'user';

        const message = await SupportMessage.create({
            ticketId: new mongoose.Types.ObjectId(ticketId as string),
            senderType,
            senderId: new mongoose.Types.ObjectId(userId),
            message: parsed.data.message,
            attachments: parsed.data.attachments,
        });

        await emitSupportEvent(SUPPORT_EVENTS.MESSAGE_CREATED, {
            ticketId,
            messageId: message._id,
            senderId: userId,
            senderType,
        });

        res.status(201).json({
            meta: { status: 201, message: 'Message added' },
            data: message,
        });
    } catch (error: any) {
        console.error('addMessage error:', error);
        res.status(500).json({
            meta: { status: 500, message: 'Internal server error' },
            errors: [{ message: error.message }],
        });
    }
};

// ─── List Messages for a Ticket ───
export const getMessages = async (req: AuthRequest, res: Response) => {
    try {
        const ticketId = req.params.id;

        const ticket = await SupportTicket.findById(ticketId).select('userId').lean();
        if (!ticket) {
            return res.status(404).json({
                meta: { status: 404, message: 'Ticket not found' },
            });
        }

        // Access control
        const userId = req.user!.id;
        const role = req.user!.role;
        if (role !== 'admin' && role !== 'agent' && ticket.userId.toString() !== userId) {
            return res.status(403).json({
                meta: { status: 403, message: 'Not authorized to view messages' },
            });
        }

        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const skip = (page - 1) * limit;

        const filter = { ticketId: new mongoose.Types.ObjectId(ticketId as string) };

        const [messages, total] = await Promise.all([
            SupportMessage.find(filter).sort({ createdAt: 1 }).skip(skip).limit(limit).lean(),
            SupportMessage.countDocuments(filter),
        ]);

        res.json({
            meta: {
                status: 200,
                message: 'Messages retrieved',
                pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
            },
            data: messages,
        });
    } catch (error: any) {
        console.error('getMessages error:', error);
        res.status(500).json({
            meta: { status: 500, message: 'Internal server error' },
            errors: [{ message: error.message }],
        });
    }
};
