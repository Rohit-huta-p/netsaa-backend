import { Request, Response } from 'express';
import mongoose from 'mongoose';
import EventReservation from '../models/EventReservation';
import EventRegistration from '../models/EventRegistration';
import EventStats from '../models/EventStats';
import Event from '../models/Event';

// Mock Stripe for now
const stripe = {
    paymentIntents: {
        create: async (data: any) => ({
            id: 'pi_mock_' + Date.now(),
            client_secret: 'secret_mock_' + Date.now(),
            amount: data.amount
        })
    }
};

/**
 * Create Payment Intent for PAID reservations.
 * Expects a valid reservation ID.
 */
export const createPaymentIntent = async (req: Request, res: Response) => {
    try {
        const { reservationId } = req.body;
        const userId = (req as any).user.id;

        const reservation = await EventReservation.findOne({ _id: reservationId, userId });
        if (!reservation) {
            return res.status(404).json({ success: false, message: 'Reservation not found' });
        }

        if (reservation.status !== 'reserved') {
            return res.status(400).json({ success: false, message: 'Reservation is not active' });
        }

        if (reservation.expiresAt < new Date()) {
            reservation.status = 'expired';
            await reservation.save();
            return res.status(400).json({ success: false, message: 'Reservation expired' });
        }

        if (reservation.totalAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Amount is zero, proceed to free registration' });
        }

        // Create Stripe Intent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(reservation.totalAmount * 100), // cents
            currency: 'inr',
            metadata: {
                reservationId: reservation.id,
                eventId: reservation.eventId.toString(),
                userId: userId
            }
        });

        res.json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        });

    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Finalize Registration.
 * - For FREE events: call directly with reservationId.
 * - For PAID events: call after Payment Success (or webhook).
 * 
 * Verifies reservation validity and converts to EventRegistration.
 */
export const finalizeRegistration = async (req: Request, res: Response) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { reservationId, paymentIntentId } = req.body;
        const userId = (req as any).user.id;

        const reservation = await EventReservation.findOne({ _id: reservationId, userId }).session(session);

        if (!reservation) {
            throw new Error('Reservation not found');
        }

        // Check if already finalized (idempotency check)
        if (reservation.status === 'paid') {
            await session.abortTransaction(); // No need to error, just return success if already done? 
            // Better to return the existing registration
            const existingReg = await EventRegistration.findOne({
                eventId: reservation.eventId,
                userId,
                ticketTypeId: reservation.ticketTypeId
            });
            return res.json({ success: true, data: existingReg, message: 'Already registered' });
        }

        if (reservation.status !== 'reserved') {
            throw new Error('Reservation is not active');
        }

        // Validity Checks
        if (reservation.expiresAt < new Date()) {
            reservation.status = 'expired';
            await reservation.save({ session });
            throw new Error('Reservation expired');
        }

        // Validate Payment (if paid)
        if (reservation.totalAmount > 0) {
            if (!paymentIntentId) {
                throw new Error('Payment required');
            }
            // In real world, verify Stripe Intent status here
        }

        // 1. Update Reservation Status
        reservation.status = 'paid';
        await reservation.save({ session });

        // 2. Create Registration
        const [registration] = await EventRegistration.create([{
            eventId: reservation.eventId,
            userId: reservation.userId,
            ticketTypeId: reservation.ticketTypeId,
            quantity: reservation.quantity,
            status: 'registered',
            registeredAt: new Date()
        }], { session });

        // 3. Update Stats
        await EventStats.findOneAndUpdate(
            { eventId: reservation.eventId },
            { $inc: { registrations: reservation.quantity } },
            { upsert: true, session }
        );

        await session.commitTransaction();

        res.status(201).json({
            success: true,
            data: registration,
            message: 'Registration successful'
        });

    } catch (error: any) {
        await session.abortTransaction();
        res.status(400).json({ success: false, message: error.message });
    } finally {
        session.endSession();
    }
};
