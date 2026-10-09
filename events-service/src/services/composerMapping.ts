/**
 * v4 composer → Event document mapping.
 *
 * Pure (no DB, no network): takes the POST /v1/events body produced by the
 * frontend's buildEventPayload (the single shared contract) and returns the
 * object handed to Event.create(). Kept pure so it can be unit-tested without
 * mongodb-memory-server.
 *
 * Rules enforced here:
 *  - count-on-read seats (E5): capacity is the CAP, never a counter. We derive
 *    maxParticipants / capacity.total from the sum of spot capacities, not from
 *    the client-sent capacity.total (which we treat as a hint only).
 *  - money reads the spot (E1): ticketPrice is derived from the lowest paid
 *    spot price, never trusted blindly from the client.
 *  - required sub-fields are guarded: incomplete people/spots/offers/questions
 *    are dropped so a create never throws on a Mongoose "required" violation.
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

export interface ComposerMapResult {
  doc: Record<string, any>;
  /** Only schedule reminders for a live event that has a real date. */
  scheduleReminders: boolean;
}

export function mapComposerToEventDoc(b: any, user: any, userId: string): ComposerMapResult {
  // ── dates / schedule ──────────────────────────────────────────────
  const startDate = toDate(b.startsAt);
  const explicitEnd = toDate(b.endsAt);
  const durMin = DURATION_MIN[b.durationKind] ?? 120;
  const timeTbd = !!b.timeTbd;

  let scheduleStart: Date;
  let scheduleEnd: Date;
  let totalDurationMinutes: number;

  if (startDate) {
    scheduleStart = startDate;
    if (explicitEnd && explicitEnd.getTime() > startDate.getTime()) {
      scheduleEnd = explicitEnd;
      totalDurationMinutes = Math.round((explicitEnd.getTime() - startDate.getTime()) / 60000);
    } else {
      totalDurationMinutes = durMin;
      scheduleEnd = new Date(startDate.getTime() + durMin * 60000);
    }
  } else {
    // timeTbd with no date: placeholder start; UI shows "Date to be announced" via the timeTbd flag.
    totalDurationMinutes = durMin;
    scheduleStart = new Date(Date.now() + TBD_PLACEHOLDER_DAYS * 86400000);
    scheduleEnd = new Date(scheduleStart.getTime() + durMin * 60000);
  }

  // ── spots → derived capacity + money (count-on-read, E5 / money-from-spot, E1) ──
  const spots = (Array.isArray(b.spots) ? b.spots : [])
    .filter((s: any) => str(s?.name))
    .map((s: any) => ({
      name: str(s.name),
      note: str(s.note) || undefined,
      capacity: Number(s.capacity) || 0,
      price: Number(s.price) || 0,
    }));
  const hasSpots = spots.length > 0;
  const capacityTotal = hasSpots
    ? spots.reduce((n: number, s: any) => n + (s.capacity || 0), 0)
    : (Number(b.capacity?.total) || 0);
  const isPaid = b.registrationMode === 'paid_ticket';
  const paidPrices = spots.map((s: any) => s.price).filter((p: number) => p > 0);
  const ticketPrice = isPaid
    ? (paidPrices.length ? Math.min(...paidPrices) : (Number(b.pricing?.amount) || 0))
    : 0;

  // ── offers (paid only; drop nameless; keep spotId only when a valid ObjectId) ──
  const offers = (isPaid && Array.isArray(b.offers) ? b.offers : [])
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

  // ── registration ──
  const door: 'open' | 'guest_list' | 'apply' =
    ['open', 'guest_list', 'apply'].includes(b.registration?.door) ? b.registration.door : 'open';
  const questions = (Array.isArray(b.registration?.questions) ? b.registration.questions : [])
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

  // ── people (drop nameless) ──
  const people = (Array.isArray(b.people) ? b.people : [])
    .filter((p: any) => str(p?.displayName))
    .map((p: any) => ({
      userId: oid(p.userId),
      displayName: str(p.displayName),
      role: str(p.role) || undefined,
      avatarUrl: p.avatarUrl || undefined,
      invite: p.invite ? { status: p.invite.status === 'joined' ? 'joined' : 'invited' } : undefined,
    }));

  // ── structured refund window ──
  const cp = b.cancellationPolicy;
  const cancellationPolicy = cp ? {
    fullRefundUntil: toDate(cp.fullRefundUntil),
    partialRefundUntil: toDate(cp.partialRefundUntil),
    partialRefundPercent: cp.partialRefundPercent != null ? Number(cp.partialRefundPercent) : undefined,
    notes: str(cp.notes) || undefined,
  } : undefined;

  const locType = b.location?.kind === 'online' ? 'online' : 'physical';
  const languages = Array.isArray(b.languages) ? b.languages.filter(Boolean) : [];
  const lineup = (Array.isArray(b.lineup) ? b.lineup : [])
    .filter((l: any) => str(l?.title))
    .map((l: any) => ({ when: str(l.when) || undefined, title: str(l.title), detail: str(l.detail) || undefined }));
  const bring = b.bring && (b.bring.items?.length || str(b.bring.note))
    ? { items: Array.isArray(b.bring.items) ? b.bring.items.filter(Boolean) : [], note: str(b.bring.note) || undefined }
    : undefined;
  const status = b.status || 'live';

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

    startsAt: scheduleStart,
    timeTbd,
    durationKind: b.durationKind,
    schedule: { startDate: scheduleStart, endDate: scheduleEnd, totalDurationMinutes, dayBreakdown: [] },

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
    offers,
    registration: { door, questions },
    requiresApproval: b.requiresApproval != null ? !!b.requiresApproval : door !== 'open',
    people,
    lineup,
    bring,
    included: Array.isArray(b.included) ? b.included.filter(Boolean) : [],
    languages,
    ageRestriction: b.ageRestriction != null ? Number(b.ageRestriction) : undefined,
    cancellationPolicy,
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

  return { doc, scheduleReminders: status === 'live' && !timeTbd && !!startDate };
}
