import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IGig extends Document {
  title: string;
  description: string;

  type: 'one-time' | 'recurring' | 'contract';
  /** @deprecated Plan 4 — superseded by `eventFunction`. Kept for backward read compatibility; new writes should use `eventFunction`. */
  category: string;
  tags: string[];

  // Organizer info
  organizerId: mongoose.Types.ObjectId;
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

  ageRange: {
    min: number;
    max: number;
  };

  genderPreference: 'any' | 'male' | 'female' | 'other';

  heightRequirements?: {
    male: { min: string; max: string };
    female: { min: string; max: string };
  };

  /** @deprecated Plan 4 — superseded by structured `visualDetails.bodyType` + existing `ageRange` + `heightRequirements`. Kept for backward read. */
  physicalRequirements?: string;

  // Location
  location: {
    city: string;
    state: string;
    country: string;
    venueName: string;
    address: string;
    isRemote: boolean;
  };

  // Schedule
  schedule: {
    startDate: Date;
    endDate: Date;
    durationLabel: string;
    timeCommitment: string;
    /** @deprecated Plan 4 — practice-day tracking removed from UI. Kept for backward read; no new writes. */
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
    amount: number;
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

  // Booking terms (Phase 2A — master/template terms instantiated into per-hire contracts)
  paymentStructure?: 'full' | 'advance_balance';
  cancellationPolicy?: '24h' | '48h' | '72h';
  /** Forfeit percentage if cancelled within the policy window. 0-100, default 100. */
  cancellationForfeitPct?: number;
  /** Hirer-authored cancellation policy text. If set, used verbatim in contracts. If empty, contract shows only structured window + forfeit % fields. */
  cancellationCustomText?: string;
  /** Phase 4A — 1-5 custom contract clauses, ≤500 chars each. Joined into per-hire contract terms.customTerms at hire time. */
  customClauses?: string[];

  // ── GigForm v2 additions (Plan 4) ──────────────────────────────

  /** Free-form event function. UI shows preset chips but accepts custom strings (trimmed, max 80 chars). */
  eventFunction?: string;

  /** Multi-select languages the performer must speak/sing/host in. Optional; required in client only for audience-facing roles. */
  languagePreferences?: string[];

  /** Conditional block — reveals when artistTypes includes a music performer (Singer/Musician/Band/DJ/Music Producer). */
  musicDetails?: {
    genres?: string[];
    equipmentProvided?: boolean;
    // Producer-only
    bpm?: number;
    musicalKey?: string;
    deliverableFormats?: string[];
    referenceTracks?: string[];
    turnaroundDays?: number;
    revisionsIncluded?: number;
    // DJ-only
    setLengthHours?: number;
    // Band-only
    bandSize?: number;
    attirePreference?: 'formal' | 'casual' | 'themed' | 'open';
  };

  /** Conditional block — required when artistTypes includes 'Model'. */
  modelDetails?: {
    shootType?: 'Editorial' | 'Commercial' | 'Fashion' | 'Fitness' | 'Lifestyle' | 'Art';
    nudityLevel?: 'None' | 'Implied' | 'Partial' | 'Artistic' | 'Nude';
    wardrobeNotes?: string;
    usageRights?: string[];
    releaseRequired?: boolean;
    measurements?: {
      height?: string;
      bust?: string;
      waist?: string;
      hips?: string;
      hair?: string;
      eyes?: string;
    };
  };

  /** Conditional block — reveals for visual performers (Dancer/Actor/Emcee/Performing Artist). */
  visualDetails?: {
    roleType?: 'lead' | 'supporting' | 'extra' | 'background';
    bodyType?: ('slim' | 'athletic' | 'average' | 'plus' | 'any')[];
  };

  /** Conditional block — reveals for creative crew (Photographer/Videographer/Makeup Artist/Stylist). */
  crewDetails?: {
    deliverables?: string;
    styleReferences?: string[];
    equipmentProvided?: boolean;
  };
}

const GigSchema = new Schema<IGig>({
  title: { type: String, required: true },
  description: { type: String },

  type: {
    type: String,
    enum: ['one-time', 'recurring', 'contract'],
    required: true
  },
  // @deprecated Plan 4 — superseded by `eventFunction`. Readable for backward compat; no new writes.
  category: { type: String, required: false },
  tags: [String],

  organizerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }, // Index for finding gigs by organizer
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

  // @deprecated Plan 4 — superseded by structured visualDetails.bodyType + ageRange + heightRequirements.
  physicalRequirements: String,

  location: {
    city: { type: String, required: true }, // Index logic handled by compound index below?
    state: String,
    country: String,
    venueName: String,
    address: String,
    isRemote: { type: Boolean, default: false }
  },

  schedule: {
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    durationLabel: String,
    timeCommitment: String,
    // @deprecated Plan 4 — practice-day tracking removed from UI. Kept for backward read; no new writes.
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

  applicationDeadline: { type: Date, required: true },
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

  // Booking terms (Phase 2A) — master/template values that get instantiated
  // into the per-hire Contract at booking time. Optional + additive: existing
  // gigs without these fields keep working; defaults apply on new writes.
  paymentStructure: {
      type: String,
      enum: ['full', 'advance_balance'],
      default: 'full',
  },
  cancellationPolicy: {
      type: String,
      enum: ['24h', '48h', '72h'],
      default: '48h',
  },
  cancellationForfeitPct: {
      type: Number,
      min: 0,
      max: 100,
      default: 100,
  },
  cancellationCustomText: {
      type: String,
      trim: true,
      maxlength: 500,
  },
  customClauses: {
      type: [String],
      default: undefined,
      validate: {
          validator: (arr: string[]) => !arr || (arr.length <= 5 && arr.every((s) => typeof s === 'string' && s.length <= 500)),
          message: 'customClauses must be at most 5 items, each ≤500 characters',
      },
  },

  // ── GigForm v2 additions (Plan 4) ──────────────────────────────

  eventFunction: { type: String, trim: true, maxlength: 80, index: true },

  languagePreferences: { type: [String], default: [] },

  musicDetails: {
    genres: [String],
    equipmentProvided: Boolean,
    bpm: Number,
    musicalKey: String,
    deliverableFormats: [String],
    referenceTracks: [String],
    turnaroundDays: Number,
    revisionsIncluded: { type: Number, default: 2 },
    setLengthHours: Number,
    bandSize: Number,
    attirePreference: {
      type: String,
      enum: ['formal', 'casual', 'themed', 'open']
    }
  },

  modelDetails: {
    shootType: {
      type: String,
      enum: ['Editorial', 'Commercial', 'Fashion', 'Fitness', 'Lifestyle', 'Art']
    },
    // Sparse index — only a small fraction of gigs involve Model performers,
    // so skip index entries for documents that don't have modelDetails at all.
    // Cuts disk usage on the audit-side query without penalty for regular gigs.
    nudityLevel: {
      type: String,
      enum: ['None', 'Implied', 'Partial', 'Artistic', 'Nude']
    },
    wardrobeNotes: String,
    usageRights: [String],
    releaseRequired: Boolean,
    measurements: {
      height: String,
      bust: String,
      waist: String,
      hips: String,
      hair: String,
      eyes: String
    }
  },

  visualDetails: {
    roleType: {
      type: String,
      enum: ['lead', 'supporting', 'extra', 'background']
    },
    // Body type now multi-select per Plan 5 UX feedback (hirers want to
    // accept multiple body types for inclusivity). Mongoose treats `[String]`
    // with `enum` as: each array item must be one of the enum values.
    bodyType: {
      type: [String],
      enum: ['slim', 'athletic', 'average', 'plus', 'any'],
      default: undefined
    }
  },

  crewDetails: {
    deliverables: String,
    styleReferences: [String],
    equipmentProvided: Boolean
  },
}, { timestamps: true });

// Compound Indexes from Spec
GigSchema.index({ status: 1, publishedAt: -1 });
GigSchema.index({ "location.city": 1 });
GigSchema.index({ isUrgent: 1, publishedAt: -1 });
GigSchema.index({ isFeatured: 1, publishedAt: -1 });

// Plan 4 — event-function browse + moderator nudity audit
GigSchema.index({ eventFunction: 1, 'location.city': 1 });

// Moderator audit for nudity. Sparse — only indexes gigs that actually have
// modelDetails.nudityLevel set (a tiny minority). Avoids bloating the index
// with null entries for the 99% of non-Model gigs.
GigSchema.index({ 'modelDetails.nudityLevel': 1 }, { sparse: true });

export const Gig = mongoose.model<IGig>('Gig', GigSchema);
export default Gig;
