/**
 * Draft create through the real controller (POST /v1/events).
 * Backs the "safe by default" leave sheet: a host who bails mid-flow saves a
 * draft that may have no date and no title. The v4 create path must accept that
 * when status:'draft', and still reject a LIVE event with no date (unchanged).
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../server';

process.env.JWT_SECRET = 'test-secret';

const token = jwt.sign(
  { id: new mongoose.Types.ObjectId().toString(), role: 'artist' },
  process.env.JWT_SECRET,
);

// A v4 composer payload (has about/registrationMode/spots) saved mid-flow:
// no title, no date — the host only got a couple of steps in.
const earlyDraftBody = (over: any = {}) => ({
  eventType: 'workshop',
  title: '',
  about: '',
  registrationMode: 'free_rsvp',
  spots: [{ clientId: 'spot-0', name: 'General', capacity: 20, price: 0 }],
  registration: { door: 'open', questions: [] },
  visibility: 'public',
  status: 'draft',
  ...over,
});

describe('POST /v1/events — draft save (mid-flow, dateless)', () => {
  it('accepts a dateless, title-less DRAFT and fills safe placeholders', async () => {
    const res = await request(app)
      .post('/v1/events')
      .set('Authorization', `Bearer ${token}`)
      .send(earlyDraftBody());

    expect(res.status).toBe(201);
    expect(res.body.data._id).toBeTruthy();
    expect(res.body.data.status).toBe('draft');
    expect(res.body.data.title).toBe('Untitled event');
    expect(res.body.data.publishedAt).toBeFalsy();
  });

  it('still REJECTS a live event with no date (guard intact for non-drafts)', async () => {
    const res = await request(app)
      .post('/v1/events')
      .set('Authorization', `Bearer ${token}`)
      .send(earlyDraftBody({ status: undefined, title: 'Real Event' })); // live

    expect(res.status).toBe(400);
    expect(res.body.meta.message).toBe('Start time required');
  });

  it('a dated draft keeps its real date and title', async () => {
    const res = await request(app)
      .post('/v1/events')
      .set('Authorization', `Bearer ${token}`)
      .send(earlyDraftBody({ title: 'Kathak Lab', startsAt: new Date(Date.now() + 10 * 86400000).toISOString() }));

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('draft');
    expect(res.body.data.title).toBe('Kathak Lab');
  });
});
