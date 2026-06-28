import { Request, Response, NextFunction } from 'express';
import Event from '../models/Event';
import SavedEvent from '../models/SavedEvent';
import EventRegistration from '../models/EventRegistration';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth';
import EventTicketType from '../models/EventTicketType';
import EventReservation from '../models/EventReservation';
import EventStats from '../models/EventStats';

// @desc    Get all events with filters
// @route   GET /api/grow/events
// @access  Public
export const getEvents = async (req: Request, res: Response, next: NextFunction) => {
  console.log("getting events...")
  try {
    const {
      eventType,
      city,
      status,
      skillLevel,
      isFeatured,
      category,
      sort,
      page = 1,
      limit = 20,
    } = req.query;

    const query: any = {};

    if (eventType) query.eventType = eventType;
    if (city) query['location.city'] = city;
    if (status) query.status = status;
    else query.status = 'live'; // Default to live (published) events only
    if (skillLevel) query.skillLevel = skillLevel;
    if (isFeatured) query.isFeatured = isFeatured === 'true';
    if (category) query.category = category;

    const sortBy: any = {};
    if (sort === 'newest') sortBy.publishedAt = -1;
    else if (sort === 'oldest') sortBy.publishedAt = 1;
    else sortBy.createdAt = -1;

    const skip = (Number(page) - 1) * Number(limit);

    const events = await Event.find(query)
      .sort(sortBy)
      .skip(skip)
      .limit(Number(limit));

    const total = await Event.countDocuments(query);

    const seatsMap = await seatsByEvent(events.map((e) => e._id));
    // viewerContext for the signed-in user (route uses optionalAuth) — lets list cards show "you're going".
    const viewerId = (req as AuthRequest).user?.id || (req as AuthRequest).user?._id;
    const regByEvent: Record<string, string> = {};
    if (viewerId) {
      const myRegs = await EventRegistration.find({ userId: viewerId, eventId: { $in: events.map((e) => e._id) }, status: { $ne: 'cancelled' } }).select('eventId status').lean();
      for (const r of myRegs as any[]) regByEvent[String(r.eventId)] = r.status;
    }
    const data = events.map((e) => {
      const o = withLiveCapacity(e.toObject(), seatsMap[String(e._id)] ?? 0);
      const regStatus = regByEvent[String(e._id)];
      o.viewerContext = { hasRegistered: !!regStatus, registrationStatus: regStatus ?? null };
      return o;
    });

    res.status(200).json({
      meta: {
        status: 200,
        message: 'OK',
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)),
      },
      data,
      errors: [],
    });
  } catch (err) {
    res.status(500).json({
      meta: { status: 500, message: 'Server Error' },
      data: null,
      errors: [{ message: (err as Error).message }],
    });
  }
};



// @desc    Get all events for an organizer (Dashboard)
// @route   GET /api/grow/organizers/me/events
// @access  Private (Organizer)
export const getOrganizerEvents = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // "me" endpoint → derive from the authenticated user; keep query as a fallback for legacy callers.
    const organizerId = (req as AuthRequest).user?.id || (req as AuthRequest).user?._id || req.query.organizerId;

    if (!organizerId) {
      return res.status(400).json({
        meta: { status: 400, message: 'Organizer ID required' },
        data: null,
        errors: [{ message: 'Organizer ID is missing' }],
      });
    }

    // Fetch ALL events (drafts, published, etc.) sorted by newest
    const events = await Event.find({ organizerId }).sort({ createdAt: -1 });

    res.status(200).json({
      meta: { status: 200, message: 'OK', total: events.length },
      data: events,
      errors: [],
    });
  } catch (err) {
    res.status(500).json({
      meta: { status: 500, message: 'Server Error' },
      data: null,
      errors: [{ message: (err as Error).message }],
    });
  }
};

// @desc    Get single event
// @route   GET /api/grow/events/:id
// @access  Public
/**
 * Live seat count (sum of quantity) for non-cancelled registrations, keyed by eventId.
 * capacity.registeredCount is derived on read — never trusted from the stored doc —
 * so availability stays correct regardless of how registrations are created/cancelled.
 */
async function seatsByEvent(eventIds: any[]): Promise<Record<string, number>> {
  if (!eventIds.length) return {};
  const agg = await EventRegistration.aggregate([
    { $match: { eventId: { $in: eventIds }, status: { $in: ['registered', 'attended'] } } },
    { $group: { _id: '$eventId', seats: { $sum: { $ifNull: ['$quantity', 1] } } } },
  ]);
  const map: Record<string, number> = {};
  for (const r of agg) map[String(r._id)] = r.seats;
  return map;
}

/** Overlay the live registeredCount (+ backfill total from maxParticipants for legacy docs). */
function withLiveCapacity(eventObj: any, registeredCount: number): any {
  eventObj.capacity = {
    total: eventObj.capacity?.total ?? eventObj.maxParticipants ?? 0,
    registeredCount,
  };
  // Frontend reads event.pricing.{amount,refundPolicy}; the model stores ticketPrice (scalar)
  // + cancellationPolicy. Overlay so paid events don't render ₹0.
  eventObj.pricing = {
    amount: eventObj.ticketPrice ?? 0,
    currency: 'INR',
    refundPolicy: eventObj.cancellationPolicy ? 'custom' : 'flex_24h',
    refundCustomNote: eventObj.cancellationPolicy?.notes,
  };
  return eventObj;
}

export const getEventById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({
        meta: { status: 404, message: 'Event not found' },
        data: null,
        errors: [{ message: 'Event not found' }],
      });
    }
    let viewerContext = null;
    // Check for viewer context if user is authenticated/identifiable
    // This requires check for optional auth if possible, or just check req.headers manually if optionalAuth is not applied?
    // Wait, route will have optionalAuth middleware so req.user will be populated.
    // I need to cast req to AuthRequest inside
    const user = (req as AuthRequest).user;

    if (user) {
      const [hasSaved, registration] = await Promise.all([
        SavedEvent.exists({ eventId: event._id, userId: user.id }),
        EventRegistration.findOne({ eventId: event._id, userId: user.id })
      ]);

      viewerContext = {
        hasSaved: !!hasSaved,
        hasRegistered: !!registration,
        registrationStatus: registration ? registration.status : null
      };
    }

    const seatsMap = await seatsByEvent([event._id]);
    const eventObj = withLiveCapacity(event.toObject(), seatsMap[String(event._id)] ?? 0);

    // Enrich organizerSnapshot from the organizer's live profile (avatar / verified / role).
    const organizer: any = await User.findById(event.organizerId).select('displayName profileImageUrl role kycStatus averageRating').lean();
    if (organizer) {
      eventObj.organizerSnapshot = {
        ...(eventObj.organizerSnapshot || {}),
        name: organizer.displayName || eventObj.organizerSnapshot?.name,
        avatar: organizer.profileImageUrl,
        verified: organizer.kycStatus === 'approved',
        role: organizer.role,
        rating: organizer.averageRating ?? eventObj.organizerSnapshot?.rating,
      };
    }

    res.status(200).json({
      meta: { status: 200, message: 'OK' },
      data: {
        ...eventObj,
        viewerContext
      },
      errors: [],
    });
  } catch (err) {
    res.status(500).json({
      meta: { status: 500, message: 'Server Error' },
      data: null,
      errors: [{ message: (err as Error).message }],
    });
  }
};

// @desc    Create new event
// @route   POST /v1/events
// @access  Private (any authenticated user)

const DURATION_MIN: Record<string, number> = {
  m30: 30, h1: 60, h2: 120, h3: 180, half: 240, full: 480, multi: 480,
};

export const createEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body || {};
    const user = (req as AuthRequest).user;
    const userId = user?.id || user?._id;
    if (!userId) {
      return res.status(401).json({ meta: { status: 401, message: 'Not authorized' }, data: null, errors: [] });
    }

    // Detect shape: new composer payload has `about`, `capacity`, `startsAt`, or `registrationMode`.
    // Legacy payload has `description` + `schedule` directly.
    const isNew =
      b.about !== undefined ||
      b.capacity !== undefined ||
      b.startsAt !== undefined ||
      b.registrationMode !== undefined;

    if (!isNew) {
      // ── LEGACY passthrough — keep old behavior for existing tests/callers ──
      const { ticketTypes, ...eventData } = b;
      const pricingMode = eventData.pricingMode || 'fixed';

      let event: any;

      if (pricingMode === 'fixed') {
        event = await Event.create({
          ...eventData,
          organizerId: eventData.organizerId || userId,
          pricingMode: 'fixed',
          ticketPrice: eventData.ticketPrice || 0,
        });
      } else if (pricingMode === 'ticketed') {
        if (!ticketTypes || !Array.isArray(ticketTypes) || ticketTypes.length === 0) {
          throw new Error('Ticketed events must have at least one ticket type.');
        }
        event = await Event.create({
          ...eventData,
          organizerId: eventData.organizerId || userId,
          pricingMode: 'ticketed',
          ticketPrice: 0,
          maxParticipants: 0,
        });
        const ticketsToCreate = ticketTypes.map((t: any) => ({
          ...t,
          eventId: event._id,
          salesStartAt: t.salesStartAt || new Date(),
          salesEndAt: t.salesEndAt || event.registrationDeadline || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        }));
        await EventTicketType.insertMany(ticketsToCreate);
      } else {
        throw new Error('Invalid pricingMode. Must be "fixed" or "ticketed".');
      }

      return res.status(201).json({ meta: { status: 201, message: 'Event created' }, data: event, errors: [] });
    }

    // ── NEW composer shape → map to model ──
    if (!b.startsAt) {
      return res.status(400).json({ meta: { status: 400, message: 'Start time required' }, data: null, errors: [] });
    }

    const startDate = new Date(b.startsAt);
    const totalDurationMinutes = DURATION_MIN[b.durationKind] ?? 120;
    const endDate = new Date(startDate.getTime() + totalDurationMinutes * 60000);
    const locType = b.location?.kind === 'online' ? 'online' : 'physical';
    const isPaid = b.registrationMode === 'paid_ticket';

    const event = await Event.create({
      title: b.title,
      description: b.about,
      about: b.about,
      tagline: b.tagline,
      whatToExpect: b.whatToExpect,
      eventType: b.eventType || 'workshop',
      category: b.category || b.topicTags?.[0] || b.skills?.[0] || 'general',
      tags: b.topicTags || [],
      skills: b.skills || [],
      topicTags: b.topicTags || [],
      media: b.media || [],
      organizerId: userId,
      organizerSnapshot: {
        name: user?.name || user?.displayName || 'Host',
        organizationName: user?.organizationName || '',
      },
      pricingMode: 'fixed',
      registrationMode: b.registrationMode || 'free_rsvp',
      ticketPrice: isPaid ? (b.pricing?.amount || 0) : 0,
      capacity: { total: b.capacity?.total ?? 0, registeredCount: 0 },
      maxParticipants: b.capacity?.total ?? 0,
      startsAt: startDate,
      durationKind: b.durationKind,
      schedule: { startDate, endDate, totalDurationMinutes, dayBreakdown: [] },
      location: {
        type: locType,
        kind: b.location?.kind,
        venueName: b.location?.venueName,
        address: b.location?.address,
        meetingLink: b.location?.meetingLink,
      },
      registrationDeadline: b.registrationDeadline ? new Date(b.registrationDeadline) : undefined,
      maxGuestsPerRegistration: b.maxGuestsPerRegistration ?? 5,
      requiredAttendeeFields: b.requiredAttendeeFields || ['phone'],
      allowWaitlist: !!b.allowWaitlist,
      waitlistAutoPromote: !!b.waitlistAutoPromote,
      walkupsAllowed: !!b.walkupsAllowed,
      visibility: b.visibility || 'public',
      language: b.language || 'en',
      discussionVisibility: b.discussionVisibility || 'public',
      // Posting via the composer publishes immediately — the Step7Review screen
      // expects 'live'|'pending_review', not a draft. The public /events feed only
      // lists status:'live', so a 'draft' default would silently hide the event.
      // (No moderation gate yet → 'live'; flip to 'pending_review' when moderation lands.)
      status: b.status || 'live',
      publishedAt: (b.status || 'live') === 'live' ? new Date() : undefined,
    });

    return res.status(201).json({ meta: { status: 201, message: 'Event created' }, data: event, errors: [] });
  } catch (err) {
    return res.status(400).json({
      meta: { status: 400, message: 'Validation Error' },
      data: null,
      errors: [{ message: (err as Error).message }],
    });
  }
};

// @desc    Update event
// @route   PUT /api/grow/events/:id
// @access  Private (Organizer)
export const updateEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const event = await Event.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!event) {
      return res.status(404).json({
        meta: { status: 404, message: 'Event not found' },
        data: null,
        errors: [{ message: 'Event not found' }],
      });
    }
    res.status(200).json({
      meta: { status: 200, message: 'OK' },
      data: event,
      errors: [],
    });
  } catch (err) {
    res.status(400).json({
      meta: { status: 400, message: 'Validation Error' },
      data: null,
      errors: [{ message: (err as Error).message }],
    });
  }
};

// @desc    Delete event
// @route   DELETE /api/grow/events/:id
// @access  Private (Organizer)


// @desc    Delete event
// @route   DELETE /api/grow/events/:id
// @access  Private (Organizer)
export const deleteEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({
        meta: { status: 404, message: 'Event not found' },
        data: null,
        errors: [{ message: 'Event not found' }],
      });
    }

    // Cascading delete
    await Promise.all([
      EventTicketType.deleteMany({ eventId: event._id }),
      EventRegistration.deleteMany({ eventId: event._id }),
      EventReservation.deleteMany({ eventId: event._id }),
      SavedEvent.deleteMany({ eventId: event._id }),
      EventStats.deleteOne({ eventId: event._id })
    ]);

    await event.deleteOne();

    res.status(200).json({
      meta: { status: 200, message: 'Event deleted' },
      data: {},
      errors: [],
    });
  } catch (err) {
    res.status(500).json({
      meta: { status: 500, message: 'Server Error' },
      data: null,
      errors: [{ message: (err as Error).message }],
    });
  }
};

// @desc    Publish event
// @route   POST /api/grow/events/:id/publish
// @access  Private (Organizer)
export const publishEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({
        meta: { status: 404, message: 'Event not found' },
        data: null,
        errors: [{ message: 'Event not found' }],
      });
    }
    console.log("event publishing...: ", event);
    event.status = 'live';
    event.publishedAt = new Date();
    await event.save();

    res.status(200).json({
      meta: { status: 200, message: 'Event published' },
      data: event,
      errors: [],
    });
  } catch (err) {
    res.status(500).json({
      meta: { status: 500, message: 'Server Error' },
      data: null,
      errors: [{ message: (err as Error).message }],
    });
  }
};

// @desc    Save/Unsave event
// @route   POST /api/grow/events/:id/save
// @access  Private
export const saveEvent = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const eventId = req.params.id;
    const userId = req.user.id;

    const existing = await SavedEvent.findOne({ eventId, userId });

    if (existing) {
      await SavedEvent.deleteOne({ _id: existing._id });
      return res.status(200).json({
        meta: { status: 200, message: 'Event removed from saved' },
        data: { saved: false },
        errors: []
      });
    }

    await SavedEvent.create({ userId, eventId });

    res.status(200).json({
      meta: { status: 200, message: 'Event saved' },
      data: { saved: true },
      errors: []
    });

  } catch (err) {
    res.status(500).json({
      meta: { status: 500, message: 'Server Error' },
      data: null,
      errors: [{ message: (err as Error).message }]
    });
  }
};

// @desc    Get user's saved events
// @route   GET /api/grow/users/me/saved-events
// @access  Private
export const getSavedEvents = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user.id;

    const savedEvents = await SavedEvent.find({ userId })
      .populate('eventId', 'title schedule location category eventType ticketPrice pricingMode maxParticipants status organizerSnapshot')
      .sort({ savedAt: -1 })
      .lean();

    // Format response to include event details
    const formattedSavedEvents = savedEvents.map((saved: any) => ({
      ...saved,
      eventDetails: saved.eventId,
      eventId: saved.eventId?._id
    }));

    res.status(200).json({
      meta: { status: 200, message: 'OK', total: savedEvents.length },
      data: formattedSavedEvents,
      errors: []
    });

  } catch (err) {
    res.status(500).json({
      meta: { status: 500, message: 'Server Error' },
      data: null,
      errors: [{ message: (err as Error).message }]
    });
  }
};
