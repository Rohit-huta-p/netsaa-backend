/**
 * v4 composer → Event document mapping (create + update).
 *
 * Pure (no DB, no network): takes the POST/PATCH /v1/events body produced by the
 * frontend's buildEventPayload (the single shared contract) and returns the
 * object handed to Event.create() / the $set for findByIdAndUpdate(). Kept pure
 * so it can be unit-tested without mongodb-memory-server.
 *
 * Rules enforced here (create AND update):
 *  - count-on-read seats (E5): capacity is the CAP, never a counter. capacity.total
 *    / maxParticipants are derived from the SUM of spot capacities, not trusted
 *    from the client's capacity.total (a hint only).
 *  - money reads the spot (E1): ticketPrice is derived from the lowest paid spot
 *    price, never trusted blindly from the client.
 *  - required sub-fields are guarded: incomplete people/spots/offers/questions/
 *    lineup are dropped so a write never throws on a Mongoose "required" violation.
 */
import { Types } from 'mongoose';

export const DURATION_MIN: Record<string, number> = {
  m30: 30, h1: 60, h2: 120, h3: 180, half: 240, full: 480, multi: 480,
};

/** Far-future placeholder for a date-less (timeTbd) event — schedule.startDate is required. */
const TBD_PLACEHOLDER_DAYS = 180;

const oid = (v: any): Types.ObjectId | undefined =>
  v instanceof Types.ObjectId ? v
    : (typeof v === 'string' && Types.ObjectId.isValid(v)) ? new Types.ObjectId(v)
    : undefined;

const toDate = (v: any): Date | undefined => {
  if (!v) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
};

const str = (v: any): string => (typeof v === 'string' ? v.trim() : '');

// ── shared cleaners (drop entries that would violate a required sub-field) ──

export function cleanSpots(raw: any): Array<{ name: string; note?: string; capacity: number; price: number }> {
  return (Array.isArray(raw) ? raw : [])
    .filter((s: any) => str(s?.name))
    .map((s: any) => ({
      name: str(s.name),
      note: str(s.note) || undefined,
      capacity: Number(s.capacity) || 0,
      price: Number(s.price) || 0,
    }));
}

/** Caller decides whether offers apply at all (paid-only); this just cleans them. */
export function cleanOffers(raw: any): Array<any> {
  return (Array.isArray(raw) ? raw : [])
    .filter((o: any) => str(o?.name))
    .map((o: any) => ({
      spotId: oid(o.spotId),
      name: str(o.name),
      price: Number(o.price) || 0,
      audience: o.audience === 'group' ? 'group' : 'everyone',
      endsAt: toDate(o.endsAt),
      seatLimit: o.seatLimit != null ? Number(o.seatLimit) : undefined,
      minSeats: o.minSeats != null ? Number(o.minSeats) : undefined,
    }));
}

export function cleanQuestions(raw: any): Array<any> {
  return (Array.isArray(raw) ? raw : [])
    .filter((q: any) => str(q?.label) && q?.type)
    .map((q: any) => {
      const spotIds = Array.isArray(q.spotIds) ? q.spotIds.map(oid).filter(Boolean) : [];
      return {
        label: str(q.label),
        type: q.type,
        options: q.type === 'choice' ? (Array.isArray(q.options) ? q.options : []) : undefined,
        required: !!q.required,
        spotIds: spotIds.length ? spotIds : undefined,
      };
    });
}

export function cleanPeople(raw: any): Array<any> {
  return (Array.isArray(raw) ? raw : [])
    .filter((p: any) => str(p?.displayName))
    .map((p: any) => ({
      userId: oid(p.userId),
      displayName: str(p.displayName),
      role: str(p.role) || undefined,
      avatarUrl: p.avatarUrl || undefined,
      invite: p.invite ? { status: p.invite.status === 'joined' ? 'joined' : 'invited' } : undefined,
    }));
}

export function cleanLineup(raw: any): Array<any> {
  return (Array.isArray(raw) ? raw : [])
    .filter((l: any) => str(l?.title))
    .map((l: any) => ({ when: str(l.when) || undefined, title: str(l.title), detail: str(l.detail) || undefined }));
}

export function cleanBring(raw: any): { items: string[]; note?: string } | undefined {
  if (!raw || (!raw.items?.length && !str(raw.note))) return undefined;
  return { items: Array.isArray(raw.items) ? raw.items.filter(Boolean) : [], note: str(raw.note) || undefined };
}

export function cleanCancellation(raw: any): Record<string, any> | undefined {
  if (!raw) return undefined;
  return {
    fullRefundUntil: toDate(raw.fullRefundUntil),
    partialRefundUntil: toDate(raw.partialRefundUntil),
    partialRefundPercent: raw.partialRefundPercent != null ? Number(raw.partialRefundPercent) : undefined,
    notes: str(raw.notes) || undefined,
  };
}

/** Clamp a door to the allowed enum, falling back to a default. */
function normalizeDoor(v: any, fallback: 'open' | 'guest_list' | 'apply' = 'open'): 'open' | 'guest_list' | 'apply' {
  return (['open', 'guest_list', 'apply'] as const).includes(v) ? v : fallback;
}

/** Lowest paid spot price, or the pricing hint / fallback when no paid spot exists. */
function deriveTicketPrice(spots: Array<{ price: number }>, isPaid: boolean, hint: any, fallback: number): number {
  if (!isPaid) return 0;
  const paid = spots.map((s) => s.price).filter((p) => p > 0);
  if (paid.length) return Math.min(...paid);
  return Number(hint) || fallback || 0;
}

export interface ScheduleResult { startDate: Date; endDate: Date; totalDurationMinutes: number; hasRealDate: boolean }

export function computeSchedule(startsAt: any, endsAt: any, durationKind: any, timeTbd: boolean): ScheduleResult {
  const startDate = toDate(startsAt);
  const explicitEnd = toDate(endsAt);
  const durMin = DURATION_MIN[durationKind] ?? 120;
  if (startDate) {
    if (explicitEnd && explicitEnd.getTime() > startDate.getTime()) {
      return { startDate, endDate: explicitEnd, totalDurationMinutes: Math.round((explicitEnd.getTime() - startDate.getTime()) / 60000), hasRealDate: true };
    }
    return { startDate, endDate: new Date(startDate.getTime() + durMin * 60000), totalDurationMinutes: durMin, hasRealDate: true };
  }
  // timeTbd with no date: placeholder; the timeTbd flag drives "Date to be announced" in the UI.
  const ph = new Date(Date.now() + TBD_PLACEHOLDER_DAYS * 86400000);
  return { startDate: ph, endDate: new Date(ph.getTime() + durMin * 60000), totalDurationMinutes: durMin, hasRealDate: false };
}

// ────────────────────────────────── CREATE ──────────────────────────────────

export interface ComposerMapResult {
  doc: Record<string, any>;
  /** Only schedule reminders for a live event that has a real date. */
  scheduleReminders: boolean;
}

export function mapComposerToEventDoc(b: any, user: any, userId: string): ComposerMapResult {
  const timeTbd = !!b.timeTbd;
  const sched = computeSchedule(b.startsAt, b.endsAt, b.durationKind, timeTbd);

  const spots = cleanSpots(b.spots);
  const isPaid = b.registrationMode === 'paid_ticket';
  const capacityTotal = spots.length ? spots.reduce((n, s) => n + (s.capacity || 0), 0) : (Number(b.capacity?.total) || 0);
  const ticketPrice = deriveTicketPrice(spots, isPaid, b.pricing?.amount, 0);
  const door = normalizeDoor(b.registration?.door);

  const languages = Array.isArray(b.languages) ? b.languages.filter(Boolean) : [];
  const status = b.status || 'live';
  const locType = b.location?.kind === 'online' ? 'online' : 'physical';

  const doc: Record<string, any> = {
    title: b.title,
    description: b.about,            // legacy name (feed/search read this)
    about: b.about,                  // new name (detail UI reads this)
    tagline: b.tagline,
    whatToExpect: b.whatToExpect,
    eventType: b.eventType || 'workshop',
    eventTypeLabel: b.eventTypeLabel || undefined,
    category: b.category || b.topicTags?.[0] || b.skills?.[0] || 'general',
    tags: b.topicTags || [],
    skills: b.skills || [],
    topicTags: b.topicTags || [],
    skillLevel: b.skillLevel || 'all',
    eligibleArtistTypes: Array.isArray(b.eligibleArtistTypes) ? b.eligibleArtistTypes : [],
    otherArtistTypes: Array.isArray(b.otherArtistTypes) ? b.otherArtistTypes : [],
    openToAll: !!b.openToAll,
    media: b.media || [],
    coverFit: b.coverFit === 'fill' ? 'fill' : 'whole',

    organizerId: userId,
    organizerSnapshot: {
      name: user?.name || user?.displayName || 'Host',
      organizationName: user?.organizationName || '',
    },

    pricingMode: 'fixed',
    registrationMode: b.registrationMode || 'free_rsvp',
    ticketPrice,
    capacity: { total: capacityTotal, registeredCount: 0 },
    maxParticipants: capacityTotal,

    startsAt: sched.startDate,
    timeTbd,
    durationKind: b.durationKind,
    schedule: { startDate: sched.startDate, endDate: sched.endDate, totalDurationMinutes: sched.totalDurationMinutes, dayBreakdown: [] },

    location: {
      type: locType,
      kind: b.location?.kind,
      venueName: b.location?.venueName,
      address: b.location?.address,
      city: b.location?.city,
      state: b.location?.state,
      meetingLink: b.location?.meetingLink,
    },

    // ── v4 embedded ──
    spots,
    offers: isPaid ? cleanOffers(b.offers) : [],
    registration: { door, questions: cleanQuestions(b.registration?.questions) },
    requiresApproval: b.requiresApproval != null ? !!b.requiresApproval : door !== 'open',
    people: cleanPeople(b.people),
    lineup: cleanLineup(b.lineup),
    bring: cleanBring(b.bring),
    included: Array.isArray(b.included) ? b.included.filter(Boolean) : [],
    languages,
    ageRestriction: b.ageRestriction != null ? Number(b.ageRestriction) : undefined,
    cancellationPolicy: cleanCancellation(b.cancellationPolicy),
    ticketSales: 'open',    // waiting_for_bank is set later by the payout gate (deferred)

    registrationDeadline: toDate(b.registrationDeadline),
    maxGuestsPerRegistration: b.maxGuestsPerRegistration ?? 5,
    requiredAttendeeFields: b.requiredAttendeeFields || ['phone'],
    allowWaitlist: !!b.allowWaitlist,
    waitlistAutoPromote: !!b.waitlistAutoPromote,
    walkupsAllowed: !!b.walkupsAllowed,
    visibility: b.visibility || 'public',
    language: b.language || languages[0] || 'en',
    discussionVisibility: b.discussionVisibility || 'public',
    status,
    publishedAt: status === 'live' ? new Date() : undefined,
  };

  return { doc, scheduleReminders: status === 'live' && !timeTbd && sched.hasRealDate };
}

// ────────────────────────────────── UPDATE ──────────────────────────────────

/** v4-specific keys whose presence marks a PATCH body as a composer (one-form) edit. */
const COMPOSER_PATCH_KEYS = [
  'about', 'spots', 'offers', 'registration', 'registrationMode', 'people', 'lineup',
  'bring', 'included', 'coverFit', 'skillLevel', 'eligibleArtistTypes', 'otherArtistTypes',
  'openToAll', 'eventTypeLabel', 'ageRestriction', 'cancellationPolicy', 'timeTbd', 'languages',
];

export function isComposerPatch(b: any): boolean {
  return !!b && COMPOSER_PATCH_KEYS.some((k) => b[k] !== undefined);
}

const num = (v: any): number => Number(v) || 0;

/**
 * Build a $set for a v4 composer (one-form) PATCH. Only touches fields present in
 * the body, re-derives capacity/maxParticipants/ticketPrice whenever spots or the
 * free/paid mode change, recomputes schedule when any date field changes, and
 * MERGES location so an unspecified field is never clobbered. Never writes the
 * protected fields (status, organizerId, organizerSnapshot, publishedAt, pricingMode).
 */
export function buildComposerUpdate(b: any, existing: any): Record<string, any> {
  const set: Record<string, any> = {};
  const has = (k: string) => b[k] !== undefined;

  // simple passthroughs (only when present)
  for (const k of ['title', 'tagline', 'whatToExpect', 'eventType', 'eventTypeLabel', 'skillLevel',
    'visibility', 'discussionVisibility', 'allowWaitlist', 'waitlistAutoPromote', 'walkupsAllowed',
    'maxGuestsPerRegistration', 'requiredAttendeeFields', 'registrationClosed']) {
    if (has(k)) set[k] = b[k];
  }
  if (has('openToAll')) set.openToAll = !!b.openToAll;
  if (has('coverFit')) set.coverFit = b.coverFit === 'fill' ? 'fill' : 'whole';

  // arrays
  if (has('topicTags')) { set.topicTags = b.topicTags || []; set.tags = b.topicTags || []; }
  if (has('skills')) set.skills = b.skills || [];
  if (has('eligibleArtistTypes')) set.eligibleArtistTypes = b.eligibleArtistTypes || [];
  if (has('otherArtistTypes')) set.otherArtistTypes = b.otherArtistTypes || [];
  if (has('media')) set.media = b.media || [];
  if (has('included')) set.included = (b.included || []).filter(Boolean);
  if (has('languages')) {
    const langs = (b.languages || []).filter(Boolean);
    set.languages = langs;
    if (langs[0]) set.language = langs[0];
  }
  if (has('ageRestriction')) set.ageRestriction = b.ageRestriction != null ? Number(b.ageRestriction) : undefined;

  // about → keep description (feed/search) in sync with about (detail UI)
  if (has('about')) { set.about = b.about; set.description = b.about; }

  // cleaned sub-docs
  if (has('people')) set.people = cleanPeople(b.people);
  if (has('lineup')) set.lineup = cleanLineup(b.lineup);
  if (has('bring')) set.bring = cleanBring(b.bring);
  if (has('cancellationPolicy')) set.cancellationPolicy = cleanCancellation(b.cancellationPolicy);
  if (has('registrationDeadline')) set.registrationDeadline = b.registrationDeadline ? new Date(b.registrationDeadline) : undefined;

  // registration door/questions → re-derive requiresApproval from the door
  if (has('registration')) {
    const door = normalizeDoor(b.registration?.door, existing?.registration?.door || 'open');
    set.registration = { door, questions: cleanQuestions(b.registration?.questions) };
    set.requiresApproval = door !== 'open';
  }
  if (has('requiresApproval')) set.requiresApproval = !!b.requiresApproval; // explicit override wins

  // location MERGE (don't wipe fields the client didn't send)
  if (has('location')) {
    const cur = (existing?.location && typeof existing.location.toObject === 'function')
      ? existing.location.toObject() : (existing?.location || {});
    const merged: Record<string, any> = { ...cur, ...b.location };
    merged.type = b.location?.kind === 'online' ? 'online'
      : b.location?.kind === 'in_person' ? 'physical'
      : (cur.type || 'physical');
    set.location = merged;
  }

  // registrationMode (free ↔ paid) — affects ticketPrice/offers below
  if (has('registrationMode')) set.registrationMode = b.registrationMode;

  // spots → persist; recompute capacity/maxParticipants/ticketPrice from spots or mode
  if (has('spots')) set.spots = cleanSpots(b.spots);
  const modeChanged = has('registrationMode');
  if (has('spots') || modeChanged) {
    const spots = has('spots') ? set.spots : cleanSpots(existing?.spots);
    const mode = modeChanged ? b.registrationMode : existing?.registrationMode;
    const isPaid = mode === 'paid_ticket';
    const cap = spots.length ? spots.reduce((n: number, s: any) => n + (s.capacity || 0), 0) : num(existing?.capacity?.total);
    set['capacity.total'] = cap;
    set.maxParticipants = cap;
    set.ticketPrice = deriveTicketPrice(spots, isPaid, b.pricing?.amount, num(existing?.ticketPrice));
  } else if (has('capacity') && !(existing?.spots?.length)) {
    // no spot model on this event → allow a direct capacity edit
    const cap = Number(b.capacity?.total) || 0;
    set['capacity.total'] = cap;
    set.maxParticipants = cap;
  }

  // offers (paid only; cleared when free)
  if (has('offers')) {
    const mode = modeChanged ? b.registrationMode : existing?.registrationMode;
    set.offers = mode === 'paid_ticket' ? cleanOffers(b.offers) : [];
  }

  // dates → recompute schedule from the merged values
  if (['startsAt', 'endsAt', 'durationKind', 'timeTbd'].some(has)) {
    const startsAt = has('startsAt') ? b.startsAt : existing?.startsAt;
    const endsAt = has('endsAt') ? b.endsAt : undefined;
    const durationKind = has('durationKind') ? b.durationKind : existing?.durationKind;
    const timeTbd = has('timeTbd') ? !!b.timeTbd : !!existing?.timeTbd;
    const sched = computeSchedule(startsAt, endsAt, durationKind, timeTbd);
    set.startsAt = sched.startDate;
    set.timeTbd = timeTbd;
    if (has('durationKind')) set.durationKind = durationKind;
    set.schedule = {
      startDate: sched.startDate, endDate: sched.endDate,
      totalDurationMinutes: sched.totalDurationMinutes,
      dayBreakdown: existing?.schedule?.dayBreakdown || [],
    };
  }

  return set;
}
