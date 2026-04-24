// netsa-backend/gigs-service/src/tests/updateGig.validation.test.ts
//
// Plan 4 Wave 4 — Task 10. Two concerns, two describe blocks:
//
//   1. HTTP PATCH /v1/gigs/:id update-path validation (5 cases). Confirms
//      refinements still fire on partial payloads, past-date rule still
//      applies, and that partial updates preserve unrelated existing fields
//      (the mongoose findByIdAndUpdate path does a top-level merge of the
//      payload, not a full replace).
//
//   2. Direct gigUpdateSchema.safeParse regression suite (3 cases). This is
//      the smoking-gun for eng-review P1 #1 — the Zod v4 refactor that wrapped
//      the base schema in refineGig() AFTER .partial(). The bug being
//      regression-guarded: if refinements were attached to the base schema
//      before .partial(), .partial() would strip them and the update path
//      would silently accept invalid payloads.
//
// Test JWTs are signed with role 'organizer' so requests pass the
// `requireOrganizer` gate on POST /v1/gigs (seed step) and reach the
// ownership check on PATCH (which reads req.user.id).
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../app';
import Gig from '../models/Gig';
import { authTokenFor } from './setup';
import { makeGigPayload } from './fixtures/gigFactory';

describe('PATCH /v1/gigs/:id — Plan 4 update validation', () => {
  let organizerId: string;
  let token: string;

  beforeEach(() => {
    organizerId = new mongoose.Types.ObjectId().toString();
    token = authTokenFor(organizerId, 'organizer');
  });

  async function seedGig(overrides: Record<string, unknown> = {}) {
    const payload = makeGigPayload(overrides);
    const res = await request(app)
      .post('/v1/gigs')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    return res.body.data?._id ?? res.body.data?.gig?._id;
  }

  it('400: update that adds Model to artistTypes without nudityLevel rejected', async () => {
    const gigId = await seedGig({ artistTypes: ['Photographer'] });

    const res = await request(app)
      .patch(`/v1/gigs/${gigId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        artistTypes: ['Model'],
        modelDetails: { shootType: 'Fashion' } // nudityLevel missing
      });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/Nudity level/i);
  });

  it('400: update enforces artistTypes cap at 3', async () => {
    const gigId = await seedGig();

    const res = await request(app)
      .patch(`/v1/gigs/${gigId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        artistTypes: ['Dancer', 'Singer', 'Actor', 'DJ', 'Photographer']
      });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/Maximum 3 performer types/i);
  });

  it('400: update that pins startDate to the past rejected', async () => {
    const gigId = await seedGig();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const res = await request(app)
      .patch(`/v1/gigs/${gigId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        schedule: {
          startDate: yesterday.toISOString(),
          endDate: yesterday.toISOString()
        }
      });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/today or later/i);
  });

  it('200: partial update that adds only eventFunction preserves everything else', async () => {
    const gigId = await seedGig({
      artistTypes: ['Dancer'],
      category: 'Wedding' // legacy-shape seed
    });

    const res = await request(app)
      .patch(`/v1/gigs/${gigId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ eventFunction: 'Sangeet' });

    expect([200, 201]).toContain(res.status);

    const stored = await Gig.findById(gigId).lean();
    expect(stored?.eventFunction).toBe('Sangeet');
    expect(stored?.category).toBe('Wedding'); // Preserved, not wiped
    expect(stored?.artistTypes).toContain('Dancer');
  });

  it('200: update modifies existing modelDetails sub-document field', async () => {
    // Seed a Model gig with nudityLevel=None, then PATCH to Partial.
    // Verifies that (a) the update persists, (b) refinements re-run and
    // still accept the valid transition, (c) other modelDetails fields
    // remain intact.
    const gigId = await seedGig({
      artistTypes: ['Model'],
      eventFunction: 'Photo shoot',
      ageRange: { min: 21, max: 30 }, // adult — keeps rule 5 satisfied
      modelDetails: {
        shootType: 'Fashion',
        nudityLevel: 'None',
        usageRights: ['Editorial only'],
        releaseRequired: true
      }
    });

    const res = await request(app)
      .patch(`/v1/gigs/${gigId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        modelDetails: {
          shootType: 'Fashion',       // must keep shootType (Rule 2 check on repartial)
          nudityLevel: 'Partial',     // changed
          usageRights: ['Editorial only'],
          releaseRequired: true
        }
      });

    expect([200, 201]).toContain(res.status);
    const stored = await Gig.findById(gigId).lean();
    expect(stored?.modelDetails?.nudityLevel).toBe('Partial');
    expect(stored?.modelDetails?.shootType).toBe('Fashion');
    expect(stored?.modelDetails?.releaseRequired).toBe(true);
  });
});

describe('gigUpdateSchema — refinements survive .partial() (eng-review P1 #1 regression)', () => {
  // Direct schema test, no HTTP. Verifies the Task 4 refactor: refinements
  // are applied AFTER .partial(), so partial payloads still trip HARD rules.
  // This is the smoking-gun test for the Zod v4 ordering bug the refactor
  // was designed to prevent.

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { gigUpdateSchema } = require('../utils/validation');

  it('artistTypes cap fires on partial payload', () => {
    const result = gigUpdateSchema.safeParse({
      artistTypes: ['Dancer', 'Singer', 'Actor', 'DJ']
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map((i: any) => i.message).join(' ');
      expect(msgs).toMatch(/Maximum 3 performer types/i);
    }
  });

  it('Model nudity rule fires on partial payload', () => {
    const result = gigUpdateSchema.safeParse({
      artistTypes: ['Model'],
      modelDetails: { shootType: 'Fashion' } // nudityLevel missing
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map((i: any) => i.message).join(' ');
      expect(msgs).toMatch(/Nudity level is required/i);
    }
  });

  it('empty payload passes (no refinement trips when nothing present)', () => {
    const result = gigUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
