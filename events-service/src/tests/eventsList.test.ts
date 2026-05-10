import request from 'supertest';

jest.mock('../models/Event');

import app from '../app';
import Event from '../models/Event';

describe('GET /api/events/:id', () => {
    const eventId = '507f1f77bcf86cd799439011';

    it('200 returns event with computed slotsLeft', async () => {
        (Event.findById as jest.Mock).mockReturnValue({
            populate: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    _id: eventId,
                    title: 'Open Audition',
                    capacity: { total: 50, registeredCount: 32 },
                    status: 'live',
                    organizerId: { _id: 'org1', name: 'Nritya Casting', verified: true },
                }),
            }),
        });
        (Event.findByIdAndUpdate as jest.Mock).mockResolvedValue({});

        const res = await request(app).get(`/api/events/${eventId}`);
        expect(res.status).toBe(200);
        expect(res.body.data.event.capacity.slotsLeft).toBe(18);
        expect(Event.findByIdAndUpdate).toHaveBeenCalledWith(eventId, {
            $inc: { 'stats.views': 1 },
        });
    });

    it('404 if not found', async () => {
        (Event.findById as jest.Mock).mockReturnValue({
            populate: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue(null),
            }),
        });
        const res = await request(app).get(`/api/events/${eventId}`);
        expect(res.status).toBe(404);
    });

    it('410 if event status is cancelled', async () => {
        (Event.findById as jest.Mock).mockReturnValue({
            populate: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    _id: eventId,
                    status: 'cancelled',
                    capacity: { total: 50, registeredCount: 0 },
                }),
            }),
        });
        const res = await request(app).get(`/api/events/${eventId}`);
        expect(res.status).toBe(410);
    });

    it('does not return online meeting link in plain text', async () => {
        (Event.findById as jest.Mock).mockReturnValue({
            populate: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    _id: eventId,
                    title: 'X',
                    capacity: { total: 10, registeredCount: 0 },
                    status: 'live',
                    location: {
                        kind: 'online',
                        onlinePlatform: 'zoom',
                        onlineLinkEnc: 'CIPHERTEXT',
                        onlineLinkSalt: 'SALT',
                    },
                }),
            }),
        });
        (Event.findByIdAndUpdate as jest.Mock).mockResolvedValue({});

        const res = await request(app).get(`/api/events/${eventId}`);
        expect(JSON.stringify(res.body)).not.toContain('CIPHERTEXT');
        expect(JSON.stringify(res.body)).not.toContain('SALT');
    });
});

describe('GET /api/events (list with filters)', () => {
    it('200 returns array of live events sorted by startsAt', async () => {
        const mockExec = jest.fn().mockResolvedValue([
            { _id: 'e1', title: 'Workshop A' },
            { _id: 'e2', title: 'Audition B' },
        ]);
        (Event.find as jest.Mock).mockReturnValue({
            sort: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue({
                    skip: jest.fn().mockReturnValue({
                        populate: jest.fn().mockReturnValue({
                            lean: mockExec,
                        }),
                    }),
                }),
            }),
        });
        (Event.countDocuments as jest.Mock).mockResolvedValue(2);

        const res = await request(app).get('/api/events');
        expect(res.status).toBe(200);
        expect(res.body.data.events).toHaveLength(2);
        expect(res.body.data.total).toBe(2);
    });

    it('filters by topicTag query param', async () => {
        const mockExec = jest.fn().mockResolvedValue([]);
        (Event.find as jest.Mock).mockReturnValue({
            sort: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue({
                    skip: jest.fn().mockReturnValue({
                        populate: jest.fn().mockReturnValue({ lean: mockExec }),
                    }),
                }),
            }),
        });
        (Event.countDocuments as jest.Mock).mockResolvedValue(0);

        await request(app).get('/api/events?topicTag=workshop&city=mumbai');
        expect(Event.find).toHaveBeenCalledWith(expect.objectContaining({
            status: 'live',
            topicTags: 'workshop',
        }));
    });
});
