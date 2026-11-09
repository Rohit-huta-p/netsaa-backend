/**
 * Pure unit tests for DRAFT handling in the v4 composer → Event mapping.
 * A draft is saved when a host leaves the composer mid-flow (the "safe by
 * default" leave sheet), so it may be missing a title, description, or date.
 * title + description are required:true on the schema — the mapping must fill
 * safe placeholders for drafts ONLY, and leave live (published) events exactly
 * as they were so their validation still fails without real values.
 *
 * Runs WITHOUT a database:
 *   npx jest src/tests/composerDraft.unit.test.ts
 */
import { mapComposerToEventDoc } from '../services/composerMapping';

const USER = { id: 'u1', name: 'Rohit', organizationName: 'NETSA' };
const UID = '507f1f77bcf86cd799439011';

// A barely-started event: the host opened the composer, picked a type, and left.
const earlyDraft = (over: any = {}) => ({
  eventType: 'workshop',
  title: '',
  about: '',
  registrationMode: 'free_rsvp',
  // no startsAt, no timeTbd — they never reached the date step
  spots: [{ name: 'General', capacity: 20, price: 0 }],
  registration: { door: 'open', questions: [] },
  visibility: 'public',
  status: 'draft',
  ...over,
});

describe('mapComposerToEventDoc — draft placeholders', () => {
  it('empty title + about on a draft → placeholder title/description, status draft, no publishedAt', () => {
    const { doc, scheduleReminders } = mapComposerToEventDoc(earlyDraft(), USER, UID);
    expect(doc.status).toBe('draft');
    expect(doc.title).toBe('Untitled event');
    expect(doc.description).toBe('Untitled event'); // required:true — must never be empty
    expect(doc.publishedAt).toBeUndefined();         // a draft is not published
    expect(scheduleReminders).toBe(false);           // no reminders for an unpublished draft
  });

  it('draft with a title but no description → description falls back to the title', () => {
    const { doc } = mapComposerToEventDoc(earlyDraft({ title: '  Morning Kathak  ', about: '' }), USER, UID);
    expect(doc.title).toBe('Morning Kathak');        // trimmed
    expect(doc.description).toBe('Morning Kathak');   // mirrors the title, not empty
  });

  it('draft with no date still produces a valid placeholder schedule.startDate', () => {
    const { doc } = mapComposerToEventDoc(earlyDraft(), USER, UID);
    expect(doc.schedule.startDate instanceof Date).toBe(true);
    expect(Number.isNaN(new Date(doc.schedule.startDate).getTime())).toBe(false);
    expect(doc.startsAt instanceof Date).toBe(true);
  });

  it('draft keeps real values the host DID enter (no clobbering)', () => {
    const { doc } = mapComposerToEventDoc(
      earlyDraft({ title: 'Tatkar Lab', about: 'An hour on footwork.' }),
      USER,
      UID,
    );
    expect(doc.title).toBe('Tatkar Lab');
    expect(doc.description).toBe('An hour on footwork.');
    expect(doc.about).toBe('An hour on footwork.');
  });

  it('a live event is UNCHANGED — empty title stays empty (so schema validation still rejects it)', () => {
    // status omitted → defaults to 'live'. The placeholder path must not touch it.
    const { doc } = mapComposerToEventDoc(
      { ...earlyDraft(), status: undefined, startsAt: '2026-12-01T10:00:00.000Z' },
      USER,
      UID,
    );
    expect(doc.status).toBe('live');
    expect(doc.title).toBe('');        // not 'Untitled event' — live is left alone
    expect(doc.description).toBe('');   // Event.create() will reject this, exactly as before
  });
});
