import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Force real model + service (NOT mocked) for this integration test
jest.unmock('../models/Event');

import Event from '../models/Event';
import { reserveSpot } from '../services/capacity.service';

const CAPACITY = 50;
const CONCURRENT_REQUESTS = 100;

describe('Capacity race condition (SHIP GATE)', () => {
    let mongo: MongoMemoryServer;

    beforeAll(async () => {
        mongo = await MongoMemoryServer.create();
        await mongoose.connect(mongo.getUri());
    }, 60_000);

    afterAll(async () => {
        await mongoose.disconnect();
        await mongo.stop();
    });

    beforeEach(async () => {
        await Event.deleteMany({});
    });

    it('exactly 50 of 100 concurrent reserveSpot calls succeed; final count = 50', async () => {
        const ev = await Event.create({
            organizerId: new mongoose.Types.ObjectId(),
            title: 'Concurrent RSVP Race Test',
            topicTags: ['audition'],
            registrationMode: 'free_rsvp',
            about: 'A'.repeat(150),
            startsAt: new Date(Date.now() + 86400_000),
            durationKind: 'h2',
            location: { kind: 'in_person', venueName: 'Studio X', address: 'Mumbai' },
            capacity: { total: CAPACITY, registeredCount: 0 },
            status: 'live',
            media: [{ kind: 'photo', url: 's3://x', width: 1, height: 1, isHero: true, sortOrder: 0 }],
        });

        const eventId = (ev._id as any).toString();

        // Fire all 100 in parallel
        const results = await Promise.all(
            Array.from({ length: CONCURRENT_REQUESTS }, () => reserveSpot(eventId))
        );

        const succeeded = results.filter((r) => r.ok).length;
        const failed = results.filter((r) => !r.ok).length;

        expect(succeeded).toBe(CAPACITY);
        expect(failed).toBe(CONCURRENT_REQUESTS - CAPACITY);

        // Verify stored count matches truth
        const fresh = await Event.findById(eventId).lean();
        expect((fresh as any).capacity.registeredCount).toBe(CAPACITY);
    }, 30_000);

    it('subsequent reserveSpot calls return full_or_inactive after capacity reached', async () => {
        const ev = await Event.create({
            organizerId: new mongoose.Types.ObjectId(),
            title: 'Post-Fill Reservation Test',
            topicTags: ['audition'],
            registrationMode: 'free_rsvp',
            about: 'A'.repeat(150),
            startsAt: new Date(Date.now() + 86400_000),
            durationKind: 'h2',
            location: { kind: 'in_person', venueName: 'V', address: 'A' },
            capacity: { total: 2, registeredCount: 0 },
            status: 'live',
            media: [{ kind: 'photo', url: 's3://x', width: 1, height: 1, isHero: true, sortOrder: 0 }],
        });
        const eventId = (ev._id as any).toString();

        const a = await reserveSpot(eventId);
        const b = await reserveSpot(eventId);
        const c = await reserveSpot(eventId);

        expect(a.ok).toBe(true);
        expect(b.ok).toBe(true);
        expect(c.ok).toBe(false);
        if (!c.ok) expect(c.reason).toBe('full_or_inactive');

        const fresh = await Event.findById(eventId).lean();
        expect((fresh as any).capacity.registeredCount).toBe(2);
    });

    it('reserveSpot fails when event status != live', async () => {
        const ev = await Event.create({
            organizerId: new mongoose.Types.ObjectId(),
            title: 'Cancelled Event',
            topicTags: ['audition'],
            registrationMode: 'free_rsvp',
            about: 'A'.repeat(150),
            startsAt: new Date(Date.now() + 86400_000),
            durationKind: 'h2',
            location: { kind: 'in_person', venueName: 'V', address: 'A' },
            capacity: { total: 50, registeredCount: 0 },
            status: 'cancelled',
            media: [{ kind: 'photo', url: 's3://x', width: 1, height: 1, isHero: true, sortOrder: 0 }],
        });

        const result = await reserveSpot((ev._id as any).toString());
        expect(result.ok).toBe(false);
    });
});
