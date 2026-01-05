import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IEvent extends Document {
  title: string;
  description: string;
  thumbnailUrl?: string;

  eventType: 'workshop' | 'competition' | 'meetup' | 'showcase';
  category: string;
  tags: string[];

  organizerId: mongoose.Types.ObjectId;
  organizerSnapshot: {
    name: string;
    organizationName: string;
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
      notes?: string;
    }>;
  };

  location: {
    type: 'physical' | 'online' | 'hybrid';
    venueName?: string;
    address?: string;
    city: string;
    state: string;
    country: string;
    meetingLink?: string;
  };

  registrationDeadline?: Date;
  maxParticipants: number;
  allowWaitlist: boolean;

  eventConfig?: {
    materialsProvided?: boolean;
    preparationRequired?: boolean;
    preparationNotes?: string;
    competitionFormat?: string;
    judgingCriteria?: string[];
    prizes?: Array<{ position: string; reward: string }>;
  };

  status: 'draft' | 'published' | 'cancelled' | 'completed';
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

    eventType: {
      type: String,
      enum: ['workshop', 'competition', 'meetup', 'showcase'],
      required: true,
    },
    category: { type: String, required: true },
    tags: [{ type: String }],

    organizerId: { type: Schema.Types.ObjectId, ref: 'Organizer', required: true },
    organizerSnapshot: {
      name: { type: String, required: true },
      organizationName: { type: String, required: true },
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
          notes: String,
        },
      ],
    },

    location: {
      type: {
        type: String,
        enum: ['physical', 'online', 'hybrid'],
        required: true,
      },
      venueName: String,
      address: String,
      city: { type: String, required: true },
      state: { type: String, required: true },
      country: { type: String, required: true },
      meetingLink: String,
    },

    registrationDeadline: { type: Date },
    maxParticipants: { type: Number, required: true },
    allowWaitlist: { type: Boolean, default: false },

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
      enum: ['draft', 'published', 'cancelled', 'completed'],
      default: 'draft',
    },
    isFeatured: { type: Boolean, default: false },

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

const Event: Model<IEvent> = mongoose.model<IEvent>('Event', eventSchema);

export default Event;
