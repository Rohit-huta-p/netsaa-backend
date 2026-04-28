// netsa-backend/gigs-service/src/tests/createGig.persistence.test.ts
//
// Plan 4 Wave 4 — Task 9. Round-trip proof that the new v2 sub-documents
// (musicDetails, modelDetails, visualDetails, crewDetails) persist cleanly
// through Mongoose and read back exactly as written. The final test is a
// backward-compat guard: a legacy-shape payload (no v2 fields) still
// creates and stores without picking up stray undefined sub-doc fields.
//
// Test JWTs are signed with role 'organizer' so requests pass the
// `requireOrganizer` gate on POST /v1/gigs and reach the persistence layer.
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../app';
import Gig from '../models/Gig';
import { authTokenFor } from './setup';
import { makeGigPayload } from './fixtures/gigFactory';

describe('POST /v1/gigs — Plan 4 persistence', () => {
  let organizerId: string;
  let token: string;

  beforeEach(() => {
    organizerId = new mongoose.Types.ObjectId().toString();
    token = authTokenFor(organizerId, 'organizer');
  });

  it('201: creates a gig with all new sub-documents and reads them back', async () => {
    const payload = makeGigPayload({
      artistTypes: ['Music Producer', 'Singer'],
      eventFunction: 'Music recording',
      languagePreferences: ['Hindi', 'English'],
      musicDetails: {
        genres: ['Bollywood', 'Sufi'],
        equipmentProvided: true,
        bpm: 128,
        musicalKey: 'Amin',
        deliverableFormats: ['Stems', 'Mastered WAV'],
        turnaroundDays: 14,
        revisionsIncluded: 3
      }
    });

    const res = await request(app)
      .post('/v1/gigs')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect([200, 201]).toContain(res.status);
    const gigId = res.body.data?._id ?? res.body.data?.gig?._id;
    expect(gigId).toBeTruthy();

    const stored = await Gig.findById(gigId).lean();
    expect(stored?.eventFunction).toBe('Music recording');
    expect(stored?.languagePreferences).toEqual(['Hindi', 'English']);
    expect(stored?.musicDetails?.bpm).toBe(128);
    expect(stored?.musicDetails?.turnaroundDays).toBe(14);
    expect(stored?.musicDetails?.revisionsIncluded).toBe(3);
  });

  it('201: creates a Model gig with modelDetails + measurements', async () => {
    const payload = makeGigPayload({
      artistTypes: ['Model'],
      eventFunction: 'Photo shoot',
      modelDetails: {
        shootType: 'Fashion',
        nudityLevel: 'None',
        usageRights: ['Editorial only'],
        releaseRequired: true,
        measurements: { height: "5'7\"", hair: 'black', eyes: 'brown' }
      }
    });

    const res = await request(app)
      .post('/v1/gigs')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect([200, 201]).toContain(res.status);
    const gigId = res.body.data?._id ?? res.body.data?.gig?._id;
    const stored = await Gig.findById(gigId).lean();
    expect(stored?.modelDetails?.shootType).toBe('Fashion');
    expect(stored?.modelDetails?.nudityLevel).toBe('None');
    expect(stored?.modelDetails?.measurements?.height).toBe("5'7\"");
  });

  it('201: creates a Visual-performer gig with visualDetails (bodyType multi-select)', async () => {
    const payload = makeGigPayload({
      artistTypes: ['Dancer', 'Actor'],
      eventFunction: 'Sangeet',
      visualDetails: {
        roleType: 'lead',
        // bodyType is now multi-select (array). Multiple types accepted.
        bodyType: ['athletic', 'slim']
      }
    });

    const res = await request(app)
      .post('/v1/gigs')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect([200, 201]).toContain(res.status);
    const gigId = res.body.data?._id ?? res.body.data?.gig?._id;
    const stored = await Gig.findById(gigId).lean();
    expect(stored?.visualDetails?.roleType).toBe('lead');
    expect(stored?.visualDetails?.bodyType).toEqual(expect.arrayContaining(['athletic', 'slim']));
  });

  it('201: creates a Crew gig with crewDetails', async () => {
    const payload = makeGigPayload({
      artistTypes: ['Photographer'],
      eventFunction: 'Wedding reception',
      crewDetails: {
        deliverables: '200 edited photos + highlight reel',
        styleReferences: ['https://pinterest.com/board/moody-weddings'],
        equipmentProvided: false
      }
    });

    const res = await request(app)
      .post('/v1/gigs')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect([200, 201]).toContain(res.status);
    const gigId = res.body.data?._id ?? res.body.data?.gig?._id;
    const stored = await Gig.findById(gigId).lean();
    expect(stored?.crewDetails?.deliverables).toContain('edited photos');
    expect(stored?.crewDetails?.equipmentProvided).toBe(false);
  });

  it('201: persists hirer-authored termsAndConditions (Page 4 → gig)', async () => {
    // Regression for the Apr-28 strip bug: Zod gigBaseSchema didn't list
    // termsAndConditions, so safeParse was silently dropping it before the
    // controller wrote to Mongoose. The artist Apply modal then rendered
    // "no specific terms" even when the hirer had filled the field. Adding
    // termsAndConditions to the schema closes that hole — this test locks
    // the round-trip so it doesn't regress.
    const tnc = `1. Payment: 30% advance, 70% on event day.\n2. Cancellation within 48h forfeits the advance.\n3. Travel covered by hirer for out-of-city.`;
    const payload = makeGigPayload({
      artistTypes: ['Dancer'],
      termsAndConditions: tnc,
    });
    const res = await request(app)
      .post('/v1/gigs')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect([200, 201]).toContain(res.status);
    const gigId = res.body.data?._id ?? res.body.data?.gig?._id;
    const stored = await Gig.findById(gigId).lean();
    expect(stored?.termsAndConditions).toBe(tnc);
  });

  it('201: persists teamWhatsAppInviteUrl when set', async () => {
    const payload = makeGigPayload({
      artistTypes: ['Dancer'],
      teamWhatsAppInviteUrl: 'https://chat.whatsapp.com/InviteCodeXYZ',
    });
    const res = await request(app)
      .post('/v1/gigs')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect([200, 201]).toContain(res.status);
    const gigId = res.body.data?._id ?? res.body.data?.gig?._id;
    const stored = await Gig.findById(gigId).lean();
    expect(stored?.teamWhatsAppInviteUrl).toBe('https://chat.whatsapp.com/InviteCodeXYZ');
  });

  it('400: rejects malformed teamWhatsAppInviteUrl', async () => {
    const payload = makeGigPayload({
      artistTypes: ['Dancer'],
      teamWhatsAppInviteUrl: 'not-a-url',
    });
    const res = await request(app)
      .post('/v1/gigs')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(res.status).toBe(400);
  });

  it('201: backward compat — legacy-shape payload (no new fields) still succeeds', async () => {
    const payload = makeGigPayload({
      category: 'Wedding',
      physicalRequirements: 'Height: 5.2-5.8 ft'
      // zero new fields (no eventFunction, no *Details)
    });

    const res = await request(app)
      .post('/v1/gigs')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect([200, 201]).toContain(res.status);
    const gigId = res.body.data?._id ?? res.body.data?.gig?._id;
    const stored = await Gig.findById(gigId).lean();
    expect(stored?.category).toBe('Wedding');
    expect(stored?.physicalRequirements).toBe('Height: 5.2-5.8 ft');
    expect(stored?.eventFunction).toBeUndefined();
    // Mongoose auto-initializes nested sub-doc array fields to [] even when
    // the payload omits them. The backward-compat contract is: no
    // USER-PROVIDED data ends up in the new sub-docs. Assert on SCALAR
    // fields (enums, numbers, strings) which stay undefined when unset.
    expect(stored?.modelDetails?.nudityLevel).toBeUndefined();
    expect(stored?.modelDetails?.shootType).toBeUndefined();
    expect(stored?.musicDetails?.turnaroundDays).toBeUndefined();
    expect(stored?.musicDetails?.bpm).toBeUndefined();
    expect(stored?.visualDetails?.roleType).toBeUndefined();
    expect(stored?.crewDetails?.deliverables).toBeUndefined();
    expect(stored?.crewDetails?.equipmentProvided).toBeUndefined();
  });
});
