import { Request, Response, NextFunction } from 'express';
import Event from '../models/Event';
import SavedEvent from '../models/SavedEvent';
import EventRegistration from '../models/EventRegistration';
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
    else query.status = 'published'; // Default to published events only
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

    res.status(200).json({
      meta: {
        status: 200,
        message: 'OK',
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)),
      },
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



// @desc    Get all events for an organizer (Dashboard)
// @route   GET /api/grow/organizers/me/events
// @access  Private (Organizer)
export const getOrganizerEvents = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { organizerId } = req.query; // In real auth, this comes from req.user._id

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

    res.status(200).json({
      meta: { status: 200, message: 'OK' },
      data: {
        ...event.toObject(),
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
// @route   POST /api/grow/events
// @access  Private (Organizer)
// @desc    Create new event
// @route   POST /api/grow/events
// @access  Private (Organizer)


// @desc    Create new event
// @route   POST /api/grow/events
// @access  Private (Organizer)
export const createEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // TODO: Add organizer ID from authenticated user (req.user)
    // For now assuming existing body structure from API contract
    const { ticketTypes, ...eventData } = req.body;

    // Validate pricing intent is present or default to 'fixed' logic
    const pricingMode = eventData.pricingMode || 'fixed';

    let event: any; // Using any to bypass strict type checking during creation for now or strictly type it if IEvent is importable

    if (pricingMode === 'fixed') {
      // MODE: FIXED PRICE
      // 1. Create Event ONLY
      // 2. Ignore ticketTypes array
      // 3. Ensure ticketPrice and maxParticipants are set on Event

      event = await Event.create({
        ...eventData,
        pricingMode: 'fixed',
        // Ensure ticketPrice 0 if not provided
        ticketPrice: eventData.ticketPrice || 0
      });

      // Explicitly DO NOT create any EventTicketType documents.
      // The single-price logic is handled directly via Event model fields.

    } else if (pricingMode === 'ticketed') {
      // MODE: TICKETED
      // 1. Create Event
      // 2. Validate & Create Ticket Types

      if (!ticketTypes || !Array.isArray(ticketTypes) || ticketTypes.length === 0) {
        throw new Error('Ticketed events must have at least one ticket type.');
      }

      event = await Event.create({
        ...eventData,
        pricingMode: 'ticketed',
        // Zero out event-level price/capacity fields to avoid confusion, 
        // though logic should ignore them.
        ticketPrice: 0,
        maxParticipants: 0 // logic depends on sum of tickets, or separate field? 
        // Actually, maxParticipants might still be a global cap or ignored. 
        // Let's keep it as is from request, or 0. Guide says "Ignore Event.maxParticipants"
        // But for safety, we allow it if it acts as a total cap, otherwise 0.
      });

      const ticketsToCreate = ticketTypes.map((t: any) => ({
        ...t,
        eventId: event._id,
        salesStartAt: t.salesStartAt || new Date(), // Fallbacks if missed validation
        salesEndAt: t.salesEndAt || event.registrationDeadline || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }));

      await EventTicketType.insertMany(ticketsToCreate);
    } else {
      throw new Error('Invalid pricingMode. Must be "fixed" or "ticketed".');
    }

    res.status(201).json({
      meta: { status: 201, message: 'Event created' },
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
    event.status = 'published';
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
