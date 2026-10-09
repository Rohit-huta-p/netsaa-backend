import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IGig extends Document {
  title: string;
  description: string;
  responsibilities?: string[];

  type: 'one-time' | 'recurring' | 'contract';
  tags: string[];

  // Organizer info
  organizerId: mongoose.Types.ObjectId;
  // Three-role wall: which tier posted this. Legacy gigs (missing) = creative_lead.
  posterRole?: 'client' | 'creative_lead';
  organizerSnapshot: {
    displayName: string;
    organizationName: string;
    profileImageUrl: string;
    rating: number;
    testimonials?: {
      text: string;
      author: string;
      role?: string;
      rating?: number;
    }[];
  };

  // Artist Requirements
  artistTypes: string[];
  requiredSkills: string[];
  experienceLevel: 'beginner' | 'intermediate' | 'professional';
  minExperienceYears?: number;

  ageRange: {
    min: number;
    max: number;
  };

  genderPreference: 'any' | 'male' | 'female' | 'other';

  heightRequirements?: {
    male: { min: string; max: string };
    female: { min: string; max: string };
  };

  physicalRequirements?: string;

  // Location
  location: {
    city: string;
    state: string;
    country: string;
    venueName: string;
    address: string;
    isRemote: boolean;
    geo?: { lat: number; lng: number };
  };

  // Schedule
  schedule: {
    startDate: Date;
    endDate: Date;
    durationLabel: string;
    timeCommitment: string;
    practiceDays?: {
      count: number;
      isPaid: boolean;
      mayExtend: boolean;
      notes: string;
    };
  };

  // Compensation
  compensation: {
    model: 'fixed' | 'hourly' | 'per-day' | 'per-track' | 'per-shoot';
    amount?: number;
    minAmount?: number;
    maxAmount?: number;
    currency: string;
    negotiable: boolean;
    perks: string[];
  };

  // Application Rules
  applicationDeadline: Date;
  maxApplications?: number;

  mediaRequirements?: {
    headshots: boolean;
    fullBody: boolean;
    videoReel: boolean;
    audioSample: boolean;
    notes: string;
  };

  // Gig-form v2 additions — collected by the mobile create-flow and surfaced
  // on the gig detail page. Previously sent by the client but silently dropped
  // because the model had no fields for them.
  headcount?: number;
  eventFunction?: string;
  languagePreferences?: string[];
  // Conditional Page-3 "fit" blocks. Stored as Mixed because the shape varies
  // by performer type (music / model / visual / crew) and they are optional,
  // rarely-queried sub-documents — this guarantees nothing the client sends is
  // dropped on create.
  musicDetails?: Record<string, unknown>;
  modelDetails?: Record<string, unknown>;
  visualDetails?: Record<string, unknown>;
  crewDetails?: Record<string, unknown>;

  // Status
  status: 'draft' | 'published' | 'paused' | 'closed' | 'expired';
  isUrgent: boolean;
  isFeatured: boolean;

  // Lifecycle
  publishedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  termsAndConditions?: string;
}

const GigSchema = new Schema<IGig>({
  title: { type: String, required: true },
  description: { type: String },
  responsibilities: [String],

  type: {
    type: String,
    enum: ['one-time', 'recurring', 'contract'],
    required: true
  },
  tags: [String],

  organizerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }, // Index for finding gigs by organizer
  posterRole: {
    type: String,
    enum: ['client', 'creative_lead'],
    default: 'creative_lead',
    index: true,
  },
  organizerSnapshot: {
    displayName: String,
    organizationName: String,
    profileImageUrl: String,
    rating: Number,
    testimonials: [{
      text: String,
      author: String,
      role: String,
      rating: Number
    }]
  },

  artistTypes: { type: [String], required: true, index: true }, // Index for filtering by artist type
  requiredSkills: [String],
  experienceLevel: {
    type: String,
    enum: ['beginner', 'intermediate', 'professional'],
    required: true
  },
  minExperienceYears: { type: Number },

  ageRange: {
    min: Number,
    max: Number
  },

  genderPreference: {
    type: String,
    enum: ['any', 'male', 'female', 'other'],
    default: 'any'
  },

  heightRequirements: {
    male: {
      min: String,
      max: String
    },
    female: {
      min: String,
      max: String
    }
  },

  physicalRequirements: String,

  location: {
    city: { type: String, required: true }, // Index logic handled by compound index below?
    state: String,
    country: String,
    venueName: String,
    address: String,
    isRemote: { type: Boolean, default: false },
    geo: { lat: Number, lng: Number }
  },

  schedule: {
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    durationLabel: String,
    timeCommitment: String,
    practiceDays: {
      count: Number,
      isPaid: Boolean,
      mayExtend: Boolean,
      notes: String
    }
  },

  compensation: {
    model: {
      type: String,
      // Widened for gig-form v2 (per-track = producers/musicians,
      // per-shoot = models/photographers). Must stay in sync with the
      // client CompensationModel union.
      enum: ['fixed', 'hourly', 'per-day', 'per-track', 'per-shoot'],
      required: true
    },
    amount: { type: Number, required: false }, // Made optional
    minAmount: { type: Number },
    maxAmount: { type: Number },
    currency: { type: String, default: 'INR' },
    negotiable: { type: Boolean, default: false },
    perks: [String]
  },

  // Optional in gig-form v2 — the create-flow lets hirers skip the deadline.
  // Was `required: true`, which silently 400'd any post without one.
  applicationDeadline: { type: Date },
  maxApplications: Number,

  mediaRequirements: {
    headshots: Boolean,
    fullBody: Boolean,
    videoReel: Boolean,
    audioSample: Boolean,
    notes: String
  },

  status: {
    type: String,
    enum: ['draft', 'published', 'paused', 'closed', 'expired'],
    default: 'draft',
    index: true // Index for status filtering
  },
  isUrgent: { type: Boolean, default: false },
  isFeatured: { type: Boolean, default: false },

  publishedAt: Date,
  expiresAt: { type: Date, index: true }, // Index for expiration cleanup
  termsAndConditions: String,

  // ── Gig-form v2 additions ──
  // These were already sent by the client but dropped by strict-mode schema
  // stripping. Added so the occasion, headcount, language prefs, and the
  // conditional "fit" detail blocks actually persist.
  headcount: { type: Number },
  eventFunction: { type: String, index: true },
  languagePreferences: [String],
  musicDetails: { type: Schema.Types.Mixed },
  modelDetails: { type: Schema.Types.Mixed },
  visualDetails: { type: Schema.Types.Mixed },
  crewDetails: { type: Schema.Types.Mixed },
}, { timestamps: true });

// Compound Indexes from Spec
GigSchema.index({ status: 1, publishedAt: -1 });
GigSchema.index({ "location.city": 1 });
GigSchema.index({ isUrgent: 1, publishedAt: -1 });
GigSchema.index({ isFeatured: 1, publishedAt: -1 });

export const Gig = mongoose.model<IGig>('Gig', GigSchema);
export default Gig;
