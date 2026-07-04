import request from 'supertest';
import mongoose from 'mongoose';

process.env.JWT_SECRET = 'test-secret';
process.env.INTERNAL_SERVICE_TOKEN = 'svc-token';

import app from '../server';
import Event from '../models/Event';

const ownerId = new mongoose.Types.ObjectId().toString();

/** Creates a live event (same valid payload shape as eventUpdate.integration.test.ts's
 * makeOwnerEvent) with a processing video media entry. */
async function makeEventWithProcessingVideo(overrides: Record<string, unknown> = {}) {
  return Event.create({
    title: 'Bharatanatyam Intensive',
    description: 'A deep-dive into Bharatanatyam',
    eventType: 'workshop',
    category: 'dance',
    organizerId: ownerId,
    organizerSnapshot: { name: 'Priya', organizationName: 'Kalakshetra' },
    pricingMode: 'fixed',
    ticketPrice: 0,
    schedule: {
      startDate: new Date(Date.now() + 7 * 86400000),
      endDate: new Date(Date.now() + 8 * 86400000),
      totalDurationMinutes: 120,
      dayBreakdown: [],
    },
    location: { type: 'physical', city: 'Chennai', state: 'TN', country: 'IN' },
    maxParticipants: 30,
    status: 'live',
    visibility: 'public',
    capacity: { total: 30, registeredCount: 0 },
    media: [{ kind: 'video', status: 'processing', uploadId: 'up_9', isHero: true, sortOrder: 0 }],
    ...overrides,
  });
}

describe('POST /internal/events/media/attach', () => {
  it('rejects without the service token', async () => {
    const res = await request(app).post('/internal/events/media/attach').send({ eventId: 'x', uploadId: 'y', status: 'ready' });
    expect(res.status).toBe(401);
  });

  it('flips the matching processing entry to ready with the playbackId', async () => {
    const ev = await makeEventWithProcessingVideo();
    const res = await request(app)
      .post('/internal/events/media/attach')
      .set('Authorization', 'Bearer svc-token')
      .send({ eventId: ev.id, uploadId: 'up_9', playbackId: 'pb_9', thumbnailUrl: 'https://image.mux.com/pb_9/thumbnail.jpg', duration: 11, aspectRatio: '9:16', status: 'ready' });
    expect(res.status).toBe(200);
    const fresh = await Event.findById(ev.id).lean();
    const m = (fresh!.media as any[])[0];
    expect(m.status).toBe('ready');
    expect(m.muxPlaybackId).toBe('pb_9');
  });

  it('returns 202 when no entry matches yet (race)', async () => {
    const ev = await makeEventWithProcessingVideo();
    const res = await request(app)
      .post('/internal/events/media/attach')
      .set('Authorization', 'Bearer svc-token')
      .send({ eventId: ev.id, uploadId: 'does-not-exist', playbackId: 'pb', status: 'ready' });
    expect(res.status).toBe(202);
  });
});
