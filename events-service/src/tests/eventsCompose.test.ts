import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../models/Event');
jest.mock('../models/EventTag');
jest.mock('../services/tagGovernance.service');
jest.mock('../services/notificationPublisher.service');

import app from '../app';
import Event from '../models/Event';
import { incrementTagUsage } from '../services/tagGovernance.service';
import { publishNotification } from '../services/notificationPublisher.service';

const JWT_SECRET = 'test_secret';
const userId = '507f1f77bcf86cd799439011';
const token = jwt.sign({ user: { id: userId, role: 'hirer' } }, JWT_SECRET, { expiresIn: '1h' });

const validEventBody = {
    title: 'Open Audition — Period Drama',
    topicTags: ['audition', 'theatre'],
    registrationMode: 'free_rsvp',
    about: 'A'.repeat(150),
    startsAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
    endsAt: new Date(Date.now() + 8 * 86400_000).toISOString(),
    durationKind: 'multi',
    location: { kind: 'in_person', venueName: 'Studio X', address: 'Andheri W, Mumbai' },
    capacity: { total: 50 },
    media: [{ kind: 'photo', url: 's3://...', width: 1080, height: 1080, isHero: true, sortOrder: 0 }],
};

beforeAll(() => { process.env.JWT_SECRET = JWT_SECRET; });

describe('POST /api/events', () => {
    it('401 without auth', async () => {
        const res = await request(app).post('/api/events').send(validEventBody);
        expect(res.status).toBe(401);
    });

    it('400 if topicTags empty', async () => {
        const res = await request(app)
            .post('/api/events')
            .set('Authorization', `Bearer ${token}`)
            .send({ ...validEventBody, topicTags: [] });
        expect(res.status).toBe(400);
    });

    it('400 if startsAt in past', async () => {
        const res = await request(app)
            .post('/api/events')
            .set('Authorization', `Bearer ${token}`)
            .send({ ...validEventBody, startsAt: new Date(Date.now() - 86400_000).toISOString() });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/past/i);
    });

    it('400 if media empty (>=1 required)', async () => {
        const res = await request(app)
            .post('/api/events')
            .set('Authorization', `Bearer ${token}`)
            .send({ ...validEventBody, media: [] });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/media/i);
    });

    it('200 publishes verified hirer event as live + increments tag usageCount + emits notification', async () => {
        (Event.create as jest.Mock).mockResolvedValue({ _id: 'evt1', status: 'live', topicTags: ['audition', 'theatre'], organizerId: userId });
        (Event.countDocuments as jest.Mock).mockResolvedValue(5);

        const res = await request(app)
            .post('/api/events')
            .set('Authorization', `Bearer ${token}`)
            .send(validEventBody);

        expect(res.status).toBe(200);
        expect(res.body.data.event.status).toBe('live');
        expect(incrementTagUsage).toHaveBeenCalledWith(['audition', 'theatre']);
        expect(publishNotification).toHaveBeenCalledWith(expect.objectContaining({
            subtype: 'event.new_from_followed_organizer',
        }));
    });

    it('200 routes new hirer (<3 prior events) to pending_review without firing notification', async () => {
        (Event.create as jest.Mock).mockResolvedValue({ _id: 'evt1', status: 'pending_review', topicTags: ['audition'] });
        (Event.countDocuments as jest.Mock).mockResolvedValue(1);

        const res = await request(app)
            .post('/api/events')
            .set('Authorization', `Bearer ${token}`)
            .send(validEventBody);

        expect(res.status).toBe(200);
        expect(res.body.data.event.status).toBe('pending_review');
        expect(publishNotification).not.toHaveBeenCalled();
    });

    it('200 routes auto-flagged content to pending_review even for verified hirer', async () => {
        const flagged = {
            ...validEventBody,
            about: 'Send payment via UPI to abc@bank. ' + 'A'.repeat(120),
        };
        (Event.create as jest.Mock).mockResolvedValue({ _id: 'evt1', status: 'pending_review' });
        (Event.countDocuments as jest.Mock).mockResolvedValue(10);

        const res = await request(app)
            .post('/api/events')
            .set('Authorization', `Bearer ${token}`)
            .send(flagged);

        expect(res.status).toBe(200);
        expect(res.body.data.event.status).toBe('pending_review');
        expect(res.body.data.event.moderationFlagReason).toBe('external_payment');
    });
});
