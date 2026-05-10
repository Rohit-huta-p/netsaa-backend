import mongoose from 'mongoose';
import Event from '../models/Event';

describe('Event schema — Events MVP additions', () => {
    afterEach(() => {
        // Test only schema shape, no DB connection needed
    });

    it('accepts topicTags array of 1-3 strings', () => {
        const ev = new Event({
            organizerId: new mongoose.Types.ObjectId(),
            title: 'Open Audition',
            topicTags: ['audition', 'theatre'],
            registrationMode: 'free_rsvp',
            about: 'A'.repeat(150),
            startsAt: new Date(Date.now() + 7 * 86400_000),
            endsAt: new Date(Date.now() + 8 * 86400_000),
            durationKind: 'multi',
            location: { kind: 'in_person', venueName: 'Studio', address: 'Mumbai' },
            capacity: { total: 50, registeredCount: 0 },
            status: 'live',
        });
        const err = ev.validateSync();
        expect(err).toBeUndefined();
    });

    it('rejects topicTags with 0 entries', () => {
        const ev = new Event({
            organizerId: new mongoose.Types.ObjectId(),
            title: 'X',
            topicTags: [],
            registrationMode: 'free_rsvp',
            about: 'A'.repeat(150),
            startsAt: new Date(Date.now() + 86400_000),
            durationKind: 'h2',
            location: { kind: 'in_person', venueName: 'V', address: 'A' },
            capacity: { total: 10, registeredCount: 0 },
            status: 'draft',
        });
        const err = ev.validateSync();
        expect(err?.errors['topicTags']).toBeDefined();
    });

    it('rejects topicTags with 4+ entries', () => {
        const ev = new Event({
            organizerId: new mongoose.Types.ObjectId(),
            title: 'X',
            topicTags: ['a', 'b', 'c', 'd'],
            registrationMode: 'free_rsvp',
            about: 'A'.repeat(150),
            startsAt: new Date(Date.now() + 86400_000),
            durationKind: 'h2',
            location: { kind: 'in_person', venueName: 'V', address: 'A' },
            capacity: { total: 10, registeredCount: 0 },
            status: 'draft',
        });
        const err = ev.validateSync();
        expect(err?.errors['topicTags']).toBeDefined();
    });

    it('rejects registrationMode outside enum', () => {
        const ev = new Event({
            organizerId: new mongoose.Types.ObjectId(),
            title: 'X',
            topicTags: ['audition'],
            registrationMode: 'application' as any,
            about: 'A'.repeat(150),
            startsAt: new Date(Date.now() + 86400_000),
            durationKind: 'h2',
            location: { kind: 'in_person', venueName: 'V', address: 'A' },
            capacity: { total: 10, registeredCount: 0 },
            status: 'draft',
        });
        const err = ev.validateSync();
        expect(err?.errors['registrationMode']).toBeDefined();
    });

    it('rejects capacity.total > 1000', () => {
        const ev = new Event({
            organizerId: new mongoose.Types.ObjectId(),
            title: 'X',
            topicTags: ['audition'],
            registrationMode: 'free_rsvp',
            about: 'A'.repeat(150),
            startsAt: new Date(Date.now() + 86400_000),
            durationKind: 'h2',
            location: { kind: 'in_person', venueName: 'V', address: 'A' },
            capacity: { total: 1001, registeredCount: 0 },
            status: 'draft',
        });
        const err = ev.validateSync();
        expect(err?.errors['capacity.total']).toBeDefined();
    });

    it('does NOT store slotsLeft (computed via $expr)', () => {
        const ev = new Event({
            organizerId: new mongoose.Types.ObjectId(),
            title: 'X',
            topicTags: ['audition'],
            registrationMode: 'free_rsvp',
            about: 'A'.repeat(150),
            startsAt: new Date(Date.now() + 86400_000),
            durationKind: 'h2',
            location: { kind: 'in_person', venueName: 'V', address: 'A' },
            capacity: { total: 50, registeredCount: 10, slotsLeft: 40 } as any,
            status: 'draft',
        });
        const obj = ev.toObject() as any;
        expect(obj.capacity.slotsLeft).toBeUndefined();
    });
});
