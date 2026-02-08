import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IGig extends Document {
  title: string;
  description: string;

  type: 'one-time' | 'recurring' | 'contract';
  category: string;
  tags: string[];

  // Organizer info
  organizerId: mongoose.Types.ObjectId;
  organizerSnapshot: {
    displayName: string;
    organizationName: string;
    profileImageUrl: string;
    rating: number;
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
    practiceDays?: {
      count: number;
      isPaid: boolean;
      mayExtend: boolean;
      notes: string;
    };
  };

  // Compensation
  compensation: {
    model: 'fixed' | 'hourly' | 'per-day';
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
}

const GigSchema = new Schema<IGig>({
  title: { type: String, required: true },
  description: { type: String, required: true },

  type: {
    type: String,
    enum: ['one-time', 'recurring', 'contract'],
    required: true
  },
  category: { type: String, required: true },
  tags: [String],

  organizerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }, // Index for finding gigs by organizer
  organizerSnapshot: {
    displayName: String,
    organizationName: String,
    profileImageUrl: String,
    rating: Number
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
      enum: ['fixed', 'hourly', 'per-day'],
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
}, { timestamps: true });

// Compound Indexes from Spec
GigSchema.index({ status: 1, publishedAt: -1 });
GigSchema.index({ "location.city": 1 });
GigSchema.index({ isUrgent: 1, publishedAt: -1 });
GigSchema.index({ isFeatured: 1, publishedAt: -1 });

export const Gig = mongoose.model<IGig>('Gig', GigSchema);
export default Gig;
