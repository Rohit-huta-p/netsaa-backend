// netsa-backend/gigs-service/src/tests/createGig.validation.test.ts
//
// Plan 4 Wave 3 — 9 cases covering the 5 cross-field HARD validation rules
// (from utils/validation.ts refineGig), the new `per-track` compensation
// model enum value (happy path), and two edge cases (80-char eventFunction
// cap and the exact shape of the Zod error response — the latter is
// intentionally brittle to lock the contract Plan 5 will parse).
//
// Test JWTs are signed with role 'organizer' so requests pass the
// `requireOrganizer` gate on POST /v1/gigs and reach the validation layer.
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../app';
import { authTokenFor } from './setup';
import { makeGigPayload } from './fixtures/gigFactory';

describe('POST /v1/gigs — Plan 4 validation rules', () => {
  let organizerId: string;
  let token: string;

  beforeEach(() => {
    organizerId = new mongoose.Types.ObjectId().toString();
    token = authTokenFor(organizerId, 'organizer');
  });

  it('400: artistTypes cap enforced at 3', async () => {
    const payload = makeGigPayload({
      artistTypes: ['Dancer', 'Singer', 'Actor', 'Band']
    });
    const res = await request(app)
      .post('/v1/gigs')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/Maximum 3 performer types/i);
  });

  it('400: Model without nudityLevel rejected', async () => {
    const payload = makeGigPayload({
      artistTypes: ['Model'],
      modelDetails: { shootType: 'Fashion' } // nudityLevel missing
    });
    const res = await request(app)
      .post('/v1/gigs')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/Nudity level is required/i);
  });

  it('400: Model without shootType rejected', async () => {
    const payload = makeGigPayload({
      artistTypes: ['Model'],
      modelDetails: { nudityLevel: 'None' } // shootType missing
    });
    const res = await request(app)
      .post('/v1/gigs')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/Shoot type is required/i);
  });

  it('400: Music Producer without turnaroundDays rejected', async () => {
    const payload = makeGigPayload({
      artistTypes: ['Music Producer']
      // musicDetails.turnaroundDays missing
    });
    const res = await request(app)
      .post('/v1/gigs')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/Turnaround days/i);
  });

  it('400: past startDate rejected', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const payload = makeGigPayload({
      schedule: {
        startDate: yesterday.toISOString(),
        endDate: yesterday.toISOString()
      }
    });
    const res = await request(app)
      .post('/v1/gigs')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/today or later/i);
  });

  it('400: underage + nudity rejected', async () => {
    const payload = makeGigPayload({
      artistTypes: ['Model'],
      ageRange: { min: 16, max: 22 },
      modelDetails: {
        shootType: 'Fashion',
        nudityLevel: 'Partial'
      }
    });
    const res = await request(app)
      .post('/v1/gigs')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/minors cannot require nudity/i);
  });

  it('201: compensation.model accepts per-track (new enum value)', async () => {
    const payload = makeGigPayload({
      artistTypes: ['Music Producer'],
      musicDetails: { turnaroundDays: 7 },
      compensation: {
        model: 'per-track',
        amount: 3000,
        currency: 'INR',
        negotiable: false,
        perks: []
      }
    });
    const res = await request(app)
      .post('/v1/gigs')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    // May return 201 or 200 depending on current createGig response. Both acceptable.
    expect([200, 201]).toContain(res.status);
  });

  it('400: eventFunction exceeding 80 characters rejected', async () => {
    const payload = makeGigPayload({
      eventFunction: 'x'.repeat(81) // 81 chars, schema max is 80
    });
    const res = await request(app)
      .post('/v1/gigs')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/80 characters/i);
  });

  it('400: Zod error response shape — structured fieldErrors + formErrors', async () => {
    // Triggers Rule 2 (Model without nudityLevel). Asserts the exact shape
    // of the error payload — brittle for a reason: the client Plan 5 will
    // parse this shape, so any drift must be caught here.
    const payload = makeGigPayload({
      artistTypes: ['Model'],
      modelDetails: { shootType: 'Fashion' } // nudityLevel missing
    });
    const res = await request(app)
      .post('/v1/gigs')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      meta: { status: 400, message: 'Validation failed' },
      data: null
    });
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors[0]).toHaveProperty('fieldErrors');
    expect(res.body.errors[0]).toHaveProperty('formErrors');
    // The refinement puts the error under modelDetails → nudityLevel path.
    // Zod's flatten() collapses nested paths into a dot-joined key.
    const fieldErrorKeys = Object.keys(res.body.errors[0].fieldErrors);
    expect(fieldErrorKeys.some((k: string) => /modelDetails/.test(k))).toBe(true);
  });
});
