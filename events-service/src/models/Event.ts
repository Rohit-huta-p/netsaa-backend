import mongoose, { Schema, Document } from 'mongoose';

export const REGISTRATION_MODES = ['free_rsvp', 'paid_ticket'] as const;
export const DURATION_KINDS = ['m30', 'h1', 'h2', 'h3', 'half', 'full', 'multi'] as const;
export const STATUSES = ['draft', 'pending_review', 'live', 'cancelled', 'completed'] as const;
export const LOCATION_KINDS = ['in_person', 'online'] as const;

interface IMedia {
    kind: 'photo' | 'video';
    url: string;
    thumbnailUrl?: string;
    width: number;
    height: number;
    duration?: number;
    isHero: boolean;
    sortOrder: number;
}

const MediaSchema = new Schema<IMedia>({
    kind: { type: String, enum: ['photo', 'video'], required: true },
    url: { type: String, required: true },
    thumbnailUrl: { type: String },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    duration: { type: Number },
    isHero: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
}, { _id: false });

export interface IEvent extends Document {
    organizerId: mongoose.Types.ObjectId;
    title: string;
    tagline?: string;
    topicTags: string[];
    registrationMode: typeof REGISTRATION_MODES[number];
    about: string;
    whatToExpect?: string;
    skills: string[];
    startsAt: Date;
    endsAt?: Date;
    durationKind: typeof DURATION_KINDS[number];
    location: {
        kind: typeof LOCATION_KINDS[number];
        venueName?: string;
        address?: string;
        landmark?: string;
        geo?: { type: 'Point'; coordinates: [number, number] };
        onlinePlatform?: string;
        onlineLinkEnc?: string;        // ciphertext
        onlineLinkSalt?: string;       // HKDF salt
    };
    capacity: {
        total: number;
        registeredCount: number;
        // slotsLeft NOT stored — computed in queries
    };
    pricing?: {
        amount: number;
        currency: 'INR';
        refundPolicy?: 'flex_24h' | 'firm' | 'custom';
        refundCustomNote?: string;
    };
    media: IMedia[];
    status: typeof STATUSES[number];
    moderationQueueAt?: Date;
    moderationApprovedAt?: Date;
    moderationFlagReason?: string;
    stats: { views: number; saves: number; sharesCount: number };
    cancelledAt?: Date;
    cancelReason?: string;
    cancelNote?: string;
    rescheduledFromAt?: Date;
    rescheduleNoticeAt?: Date;
    publishedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const EventSchema = new Schema<IEvent>({
    organizerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, minlength: 6, maxlength: 80 },
    tagline: { type: String, maxlength: 80 },
    topicTags: {
        type: [String],
        required: true,
        validate: {
            validator: (v: string[]) => v.length >= 1 && v.length <= 3,
            message: 'topicTags must contain 1-3 tags',
        },
        index: true,
    },
    registrationMode: { type: String, enum: REGISTRATION_MODES, required: true, default: 'free_rsvp' },
    about: { type: String, required: true, minlength: 100, maxlength: 2000 },
    whatToExpect: { type: String, maxlength: 500 },
    skills: { type: [String], default: [], validate: { validator: (v: string[]) => v.length <= 5, message: 'skills max 5' }, index: true },

    startsAt: { type: Date, required: true, index: true },
    endsAt: { type: Date },
    durationKind: { type: String, enum: DURATION_KINDS, required: true },

    location: {
        kind: { type: String, enum: LOCATION_KINDS, required: true },
        venueName: { type: String, maxlength: 100 },
        address: { type: String, maxlength: 300 },
        landmark: { type: String, maxlength: 200 },
        geo: {
            type: { type: String, enum: ['Point'] },
            coordinates: { type: [Number] },
        },
        onlinePlatform: { type: String },
        onlineLinkEnc: { type: String },
        onlineLinkSalt: { type: String },
    },

    capacity: {
        total: { type: Number, required: true, min: 1, max: 1000 },
        registeredCount: { type: Number, default: 0, min: 0 },
    },

    pricing: {
        amount: { type: Number, min: 0 },
        currency: { type: String, enum: ['INR'] },
        refundPolicy: { type: String, enum: ['flex_24h', 'firm', 'custom'] },
        refundCustomNote: { type: String, maxlength: 200 },
    },

    media: { type: [MediaSchema], default: [] },

    status: { type: String, enum: STATUSES, required: true, default: 'draft', index: true },

    moderationQueueAt: { type: Date },
    moderationApprovedAt: { type: Date },
    moderationFlagReason: { type: String },

    stats: {
        views: { type: Number, default: 0 },
        saves: { type: Number, default: 0 },
        sharesCount: { type: Number, default: 0 },
    },

    cancelledAt: { type: Date },
    cancelReason: { type: String },
    cancelNote: { type: String, maxlength: 200 },

    rescheduledFromAt: { type: Date },
    rescheduleNoticeAt: { type: Date },

    publishedAt: { type: Date },
}, {
    timestamps: true,
});

// Compound indexes for discovery queries
EventSchema.index({ topicTags: 1, startsAt: 1, status: 1 });
EventSchema.index({ 'location.geo': '2dsphere' });
EventSchema.index({ status: 1, startsAt: 1 });

// Strip storage of slotsLeft if anyone tries to set it
EventSchema.pre('save', function(next) {
    if ((this.capacity as any)?.slotsLeft !== undefined) {
        delete (this.capacity as any).slotsLeft;
    }
    next();
});

export default mongoose.model<IEvent>('Event', EventSchema);
