import express from 'express';
import { protect, requireAgent } from '../middleware/auth';
import {
    createTicket,
    getMyTickets,
    getTicketById,
    updateTicketStatus,
} from '../controllers/ticketController';
import { addMessage } from '../controllers/messageController';
import { escalateTicket } from '../controllers/escalationController';

const router = express.Router();

// ─────────────────────────────────────────────────────────────────
// POST   /api/support/tickets              → Create a new ticket
// GET    /api/support/tickets/me           → My tickets (owner)
// GET    /api/support/tickets/:id          → Single ticket (owner or admin)
// POST   /api/support/tickets/:id/message  → Add message to ticket
// PATCH  /api/support/tickets/:id/status   → Update ticket status (admin)
// POST   /api/support/tickets/:id/escalate → Escalate ticket (admin)
// ─────────────────────────────────────────────────────────────────

router.post('/tickets', protect, createTicket);
router.get('/tickets/me', protect, getMyTickets);
router.get('/tickets/:id', protect, getTicketById);
router.post('/tickets/:id/message', protect, addMessage);
router.patch('/tickets/:id/status', protect, requireAgent, updateTicketStatus);
router.post('/tickets/:id/escalate', protect, requireAgent, escalateTicket);

export default router;
