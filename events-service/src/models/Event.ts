import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IEvent extends Document {
  title: string;
  description: string;
  thumbnailUrl?: string;
  tagline?: string;
  whatToExpect?: string;
  about?: string;

  eventType: 'workshop' | 'competition' | 'meetup' | 'showcase';
  category: string;
  tags: string[];
  skills?: string[];
  topicTags?: string[];
  media?: Array<{ kind: string; url: string; width?: number; height?: number; isHero?: boolean; sortOrder?: number }>;

  registrationMode?: 'free_rsvp' | 'paid_ticket';
  startsAt?: Date;
  durationKind?: string;
  capacity?: { total?: number; registeredCount?: number };

  organizerId: mongoose.Types.ObjectId;
  organizerSnapshot: {
    name?: string;
    organizationName?: string;
    profileImageUrl?: string;
    rating?: number;
  };

  hostId?: mongoose.Types.ObjectId;
  hostSnapshot?: {
    name: string;
    bio: string;
    profileImageUrl?: string;
    rating?: number;
  };

  skillLevel: 'all' | 'beginner' | 'intermediate' | 'advanced';
  eligibleArtistTypes: string[];
  pricingMode: 'fixed' | 'ticketed';
  ticketPrice: number;

  schedule: {
    startDate: Date;
    endDate: Date;
    totalDurationMinutes: number;
    dayBreakdown: Array<{
      date: Date;
      durationMinutes: number;
      title?: string;
      subtitle?: string;
      notes?: string;
    }>;
  };

  agenda?: Array<{
    date: Date;
    title: string;
    subtitle?: string;
    startsAt?: Date;
    durationMinutes?: number;
  }>;

  location: {
    type: 'physical' | 'online' | 'hybrid';
    kind?: 'in_person' | 'online';
    venueName?: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    meetingLink?: string;                                   // online/hybrid · join link · encrypted at rest
    meetingLinkRevealAt?: 'on_register' | 'T-24h' | 'T-1h'; // when attendees see the link (D7 reversed 2026-06-26)
  };

  registrationDeadline?: Date;
  maxParticipants: number;
  allowWaitlist: boolean;
  waitlistAutoPromote: boolean;            // Q1 · per-event flag · default false (manual approval)

  cancellationPolicy?: {                    // Q2 · structured refund window (fixed-price events had no policy field)
    fullRefundUntil?: Date;                 // attendee gets full refund before this date
    partialRefundUntil?: Date;              // attendee gets `partialRefundPercent` between fullRefundUntil and this
    partialRefundPercent?: number;          // 0-100
    notes?: string;                         // free-text shown to attendees
  };

  walkupsAllowed: boolean;                  // Q11 · day-of walk-ups opt-in by organizer · default false
  maxGuestsPerRegistration: number;         // currently hard-coded 5 → moved to per-event · default 5
  requiredAttendeeFields: string[];         // ('phone' | 'email' | 'guestNames')[] · which fields organizer requires
  visibility: 'public' | 'unlisted' | 'private';  // unlisted = deep-link only, private = invite-only · default public
  ageRestriction?: number;                  // min age in years (e.g. 18)
  language: string;                         // ISO 639-1 (e.g. 'en', 'hi', 'mr') · for translation hints · default 'en'
  discussionVisibility: 'public' | 'attendees_only';  // Q8 · per-event toggle · default public

  eventConfig?: {
    materialsProvided?: boolean;
    preparationRequired?: boolean;
    preparationNotes?: string;
    competitionFormat?: string;
    judgingCriteria?: string[];
    prizes?: Array<{ position: string; reward: string }>;
  };

  registrationClosed: boolean;        // host can manually close RSVPs without cancelling the event
  status: 'draft' | 'live' | 'cancelled' | 'completed';
  isFeatured: boolean;

  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const eventSchema = new Schema<IEvent>(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    thumbnailUrl: { type: String },
    tagline: { type: String },
    whatToExpect: { type: String },
    about: { type: String },

    eventType: {
      type: String,
      enum: ['workshop', 'competition', 'meetup', 'showcase'],
      default: 'workshop',
    },
    category: { type: String },
    tags: [{ type: String }],
    skills: [{ type: String }],
    topicTags: [{ type: String }],
    media: {
      type: [{
        kind: String,
        url: String,
        width: Number,
        height: Number,
        isHero: Boolean,
        sortOrder: Number,
      }],
      default: [],
      _id: false,
    },

    registrationMode: {
      type: String,
      enum: ['free_rsvp', 'paid_ticket'],
      default: 'free_rsvp',
    },
    startsAt: { type: Date },
    durationKind: { type: String },
    capacity: {
      total: { type: Number },
      registeredCount: { type: Number, default: 0 },
    },

    organizerId: { type: Schema.Types.ObjectId, ref: 'Organizer', required: true },
    organizerSnapshot: {
      name: { type: String },
      organizationName: { type: String },
      profileImageUrl: String,
      rating: Number,
    },

    hostId: { type: Schema.Types.ObjectId, ref: 'User' },
    hostSnapshot: {
      name: String,
      bio: String,
      profileImageUrl: String,
      rating: Number,
    },

    skillLevel: {
      type: String,
      enum: ['all', 'beginner', 'intermediate', 'advanced'],
      default: 'all',
    },
    eligibleArtistTypes: [{ type: String }],

    pricingMode: {
      type: String,
      enum: ['fixed', 'ticketed'],
      default: 'fixed',
      required: true
    },

    ticketPrice: { type: Number, default: 0 },

    schedule: {
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
      totalDurationMinutes: { type: Number, required: true },
      dayBreakdown: [
        {
          date: { type: Date, required: true },
          durationMinutes: { type: Number, required: true },
          title: String,
          subtitle: String,
          notes: String,
        },
      ],
    },

    agenda: [
      {
        date: { type: Date, required: true },
        title: { type: String, required: true },
        subtitle: String,
        startsAt: Date,
        durationMinutes: Number,
      },
    ],

    location: {
      type: {
        type: String,
        enum: ['physical', 'online', 'hybrid'],
      },
      kind: { type: String, enum: ['in_person', 'online'] },
      venueName: String,
      address: String,
      city: { type: String },
      state: { type: String },
      country: { type: String },
      meetingLink: String,
      meetingLinkRevealAt: { type: String, enum: ['on_register', 'T-24h', 'T-1h'], default: 'T-24h' },
    },

    registrationDeadline: { type: Date },
    maxParticipants: { type: Number, default: 0 },
    allowWaitlist: { type: Boolean, default: false },
    waitlistAutoPromote: { type: Boolean, default: false },

    cancellationPolicy: {
      fullRefundUntil: Date,
      partialRefundUntil: Date,
      partialRefundPercent: { type: Number, min: 0, max: 100 },
      notes: String,
    },

    walkupsAllowed: { type: Boolean, default: false },
    maxGuestsPerRegistration: { type: Number, default: 5, min: 1, max: 10 },
    requiredAttendeeFields: {
      type: [{ type: String, enum: ['phone', 'email', 'guestNames'] }],
      default: ['phone'],
    },
    visibility: {
      type: String,
      enum: ['public', 'unlisted', 'private'],
      default: 'public',
    },
    ageRestriction: { type: Number, min: 0, max: 100 },
    language: { type: String, default: 'en' },
    discussionVisibility: {
      type: String,
      enum: ['public', 'attendees_only'],
      default: 'public',
    },

    eventConfig: {
      materialsProvided: { type: Boolean, default: false },
      preparationRequired: { type: Boolean, default: false },
      preparationNotes: String,
      competitionFormat: String,
      judgingCriteria: [String],
      prizes: [
        {
          position: String,
          reward: String,
        },
      ],
    },

    status: {
      type: String,
      enum: ['draft', 'live', 'cancelled', 'completed'],
      default: 'draft',
    },
    isFeatured: { type: Boolean, default: false },

    registrationClosed: { type: Boolean, default: false },

    publishedAt: Date,
  },
  { timestamps: true }
);

// Indexes
eventSchema.index({ organizerId: 1 });
eventSchema.index({ status: 1, publishedAt: -1 });
eventSchema.index({ eventType: 1 });
eventSchema.index({ category: 1 });
eventSchema.index({ 'location.city': 1 });
eventSchema.index({ skillLevel: 1 });
eventSchema.index({ 'schedule.startDate': 1 });
eventSchema.index({ visibility: 1, status: 1 });           // discovery filter (only public live events)
eventSchema.index({ status: 1, allowWaitlist: 1 });        // waitlist eligibility queries

const Event: Model<IEvent> = mongoose.model<IEvent>('Event', eventSchema);

export default Event;
