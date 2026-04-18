import mongoose, { Schema, Document, Model } from 'mongoose';

/* ---------- TypeScript interfaces ---------- */

export type AuthProvider = 'email' | 'google' | 'apple' | 'phone';
export type TrustTier = 'new' | 'rising' | 'trusted' | 'verified';
export type AccountStatus = 'active' | 'deactivated' | 'scheduled_for_deletion' | 'permanently_deleted';
export type MarketingConsentSource = 'registration' | 'settings';
export type GuardianStatus = 'none' | 'pending' | 'confirmed' | 'revoked';
export type GuardianRelationship = 'parent' | 'legal_guardian' | 'other';

// TODO(cleanup): consider extracting IGuardian + GuardianSubSchema to src/models/sub/Guardian.ts if this file exceeds 500 lines.
export interface IGuardian {
  name: string;
  phone: string;
  email?: string;
  confirmedAt?: Date;
  confirmedFromIp?: string;
  confirmedFromDeviceId?: string;
  invitedAt?: Date;
  /**
   * SHA-256 hash of the one-time invite token (hex-encoded).
   * NEVER store the raw token here. Generating code must:
   *   1. Create a cryptographically random token (e.g. crypto.randomBytes(32).toString('hex')).
   *   2. Return the raw token to the caller (sent to guardian via SMS/email).
   *   3. Store only createHash('sha256').update(rawToken).digest('hex') here.
   * Verification: SHA-256 the supplied token and compare to this field.
   */
  inviteTokenHash?: string;
  relationship?: GuardianRelationship;
}

export interface IMarketingConsent {
  accepted: boolean;
  acceptedAt?: Date | null;
  source?: MarketingConsentSource;
  policyVersion?: string;
}

export interface IUserCached {
  slug?: string;
  primaryCity?: string;
  featured?: boolean;
  averageRating?: number;
  totalReviews?: number;
}

/* ── Settings sub-interfaces ── */

export interface IPrivacySettings {
  profileVisibility: 'public' | 'connections_only' | 'private';
  showEmail: boolean;
  showPhone: boolean;
  showLocation: boolean;
}

export interface INotificationSettings {
  emailNotifications: boolean;
  pushNotifications: boolean;
  allowConnectionRequests: boolean;
  messages: boolean;
  gigUpdates: boolean;
  eventUpdates: boolean;
  marketing: boolean;
}

export interface IMessagingSettings {
  allowMessagesFrom: 'connections' | 'anyone' | 'none';
  readReceipts: boolean;
}

export interface IAccountSettings {
  language: string;
  timezone: string;
  currency: string;
}

export interface IUserSettings {
  privacy: IPrivacySettings;
  notifications: INotificationSettings;
  messaging: IMessagingSettings;
  account: IAccountSettings;
}

export interface IUserContext {
  enabled: boolean;
  profileComplete: boolean;
}

export interface IUserContexts {
  artist: IUserContext;
  hirer: IUserContext;
}

export interface IUser extends Document {
  displayName?: string;
  email: string;
  phoneNumber?: string;
  authProvider: AuthProvider;
  passwordHash?: string; // optional (SSO flows)
  emailVerifiedAt?: Date;
  phoneVerifiedAt?: Date;

  // Two-context model (PRD v4): replaces fixed 'role' field
  // Every user can be BOTH artist and hirer. Context is page-based.
  contexts: IUserContexts;
  isAdmin: boolean;

  profileImageUrl?: string; // small avatar

  // Trust Engine (PRD v4)
  trustScore: number;         // 0-100
  trustTier: TrustTier;       // derived from trustScore
  profileCompletionScore: number; // 0-100

  // KYC levels (PRD v4): 0=unverified, 1=phone+email, 2=ID verified, 3=enhanced
  kycLevel: number;
  blocked?: boolean;
  referralCode?: string;
  devices?: Array<{
    platform: 'ios' | 'android' | 'web';
    pushToken?: string;
    lastActive?: Date;
    appVersion?: string;
  }>;
  cached?: IUserCached; // denormalized quick-read fields
  settings?: IUserSettings; // user-configurable preferences
  createdAt: Date;
  updatedAt: Date;
  accountStatus?: AccountStatus;
  deletedAt?: Date;      // soft-delete timestamp
  deletionScheduledAt?: Date;
  originalEmail?: string;
  mediaPurged?: boolean;
  deleteReason?: string; // optional reason provided by user
  marketingConsent?: IMarketingConsent;

  // Age-gate fields (PRD v4 §8.1.1 / §8.3.2)
  dateOfBirth?: Date;
  isMinor: boolean;
  ageYears?: number;          // computed integer years from dateOfBirth; see pre-save hook
  guardian?: IGuardian;
  guardianStatus?: GuardianStatus;

  // Registration personalization
  intent?: ('find_gigs' | 'hire_artists' | 'learn_workshops' | 'host_events')[];
  experienceLevel?: 'beginner' | 'intermediate' | 'professional';

  // Profile Fields
  headline: string;
  bio?: string;
  location?: string;
  skills?: string[];
  experience?: Array<{
    title?: string;
    role?: string;
    projectName?: string;
    organization?: string;
    venue?: string;
    location?: string;
    description?: string;
    date?: string;
    mediaLink?: string;
  }>;
  artistType?: string[]; // Multi-select
  instagramHandle?: string;
  youtubeUrl?: string;
  spotifyUrl?: string;
  soundcloudUrl?: string;

  // Physical Attributes
  age?: string;
  gender?: string;
  height?: string;
  skinTone?: string;

  // Media URLs (stored as URLs only - no binary data)
  hasPhotos?: boolean;
  galleryUrls?: string[];  // Up to 5 photo URLs
  videoUrls?: string[];    // Up to 3 video URLs
}

/* ---------- Mongoose Schemas ---------- */

const DeviceSubSchema = new Schema(
  {
    platform: { type: String, enum: ['ios', 'android', 'web'], required: true },
    pushToken: { type: String },
    lastActive: { type: Date },
    appVersion: { type: String }
  },
  { _id: true }
);

const UserCachedSchema = new Schema(
  {
    slug: { type: String, index: true },
    primaryCity: { type: String, index: true },
    featured: { type: Boolean, default: false },
    averageRating: { type: Number, default: 0 },
    totalReviews: { type: Number, default: 0 }
  },
  { _id: false }
);

const ExperienceSubSchema = new Schema(
  {
    title: { type: String },
    role: { type: String },
    projectName: { type: String },
    organization: { type: String },
    venue: { type: String },
    location: { type: String },
    description: { type: String },
    date: { type: String, required: true },
    mediaLink: { type: String },
  },
  { _id: false }
);

/* ── Settings sub-schemas ── */

const PrivacySettingsSchema = new Schema(
  {
    profileVisibility: { type: String, enum: ['public', 'connections_only', 'private'], default: 'public' },
    showEmail: { type: Boolean, default: false },
    showPhone: { type: Boolean, default: false },
    showLocation: { type: Boolean, default: true },
  },
  { _id: false }
);

const NotificationSettingsSchema = new Schema(
  {
    emailNotifications: { type: Boolean, default: true },
    pushNotifications: { type: Boolean, default: true },
    allowConnectionRequests: { type: Boolean, default: true },
    messages: { type: Boolean, default: true },
    gigUpdates: { type: Boolean, default: true },
    eventUpdates: { type: Boolean, default: true },
    marketing: { type: Boolean, default: false },
  },
  { _id: false }
);

const MessagingSettingsSchema = new Schema(
  {
    allowMessagesFrom: { type: String, enum: ['connections', 'anyone', 'none'], default: 'connections' },
    readReceipts: { type: Boolean, default: true },
  },
  { _id: false }
);

const AccountSettingsSchema = new Schema(
  {
    language: { type: String, default: 'en' },
    timezone: { type: String, default: 'Asia/Kolkata' },
    currency: { type: String, default: 'INR' },
  },
  { _id: false }
);

const UserSettingsSchema = new Schema(
  {
    privacy: { type: PrivacySettingsSchema, default: () => ({}) },
    notifications: { type: NotificationSettingsSchema, default: () => ({}) },
    messaging: { type: MessagingSettingsSchema, default: () => ({}) },
    account: { type: AccountSettingsSchema, default: () => ({}) },
  },
  { _id: false }
);

// Marketing consent – stored at top level for easy querying / compliance exports
const MarketingConsentSchema = new Schema(
  {
    accepted: { type: Boolean, required: true, default: false },
    acceptedAt: { type: Date, default: null },
    source: { type: String, enum: ['registration', 'settings'] },
    policyVersion: { type: String },
  },
  { _id: false }
);

// Guardian sub-schema — only populated when isMinor is true
const GuardianSubSchema = new Schema(
  {
    name:                  { type: String, required: true, maxlength: 100 },
    phone:                 { type: String, required: true, maxlength: 20 },
    email:                 { type: String },
    confirmedAt:           { type: Date },
    confirmedFromIp:       { type: String, maxlength: 64 },
    confirmedFromDeviceId: { type: String, maxlength: 256 },
    invitedAt:             { type: Date },
    // SHA-256 hex hash of the raw invite token — never store plaintext. See IGuardian.inviteTokenHash.
    inviteTokenHash:       { type: String, maxlength: 64 },
    relationship:          { type: String, enum: ['parent', 'legal_guardian', 'other'] },
  },
  { _id: false }
);

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, index: true },
    phoneNumber: { type: String },
    authProvider: { type: String, enum: ['email', 'google', 'apple', 'phone'], default: 'email' },
    passwordHash: { type: String },

    emailVerifiedAt: { type: Date },
    phoneVerifiedAt: { type: Date },

    // Two-context model: every user can be both artist and hirer
    contexts: {
      artist: {
        enabled: { type: Boolean, default: true },
        profileComplete: { type: Boolean, default: false },
      },
      hirer: {
        enabled: { type: Boolean, default: true },
        profileComplete: { type: Boolean, default: false },
      },
    },
    isAdmin: { type: Boolean, default: false, index: true },

    displayName: { type: String },
    profileImageUrl: { type: String },

    // Trust Engine
    trustScore: { type: Number, default: 0, index: true },
    trustTier: { type: String, enum: ['new', 'rising', 'trusted', 'verified'], default: 'new', index: true },
    profileCompletionScore: { type: Number, default: 0 },

    // KYC levels: 0=unverified, 1=phone+email, 2=ID, 3=enhanced
    kycLevel: { type: Number, default: 0, index: true },
    blocked: { type: Boolean, default: false },
    accountStatus: {
      type: String,
      enum: ['active', 'deactivated', 'scheduled_for_deletion', 'permanently_deleted'],
      default: 'active'
    },
    deletedAt: { type: Date, default: null, index: true },
    deletionScheduledAt: { type: Date },
    originalEmail: { type: String },
    mediaPurged: { type: Boolean },
    deleteReason: { type: String },
    marketingConsent: { type: MarketingConsentSchema, default: () => ({ accepted: false, acceptedAt: null }) },

    // Age-gate fields (PRD v4 §8.1.1 / §8.3.2)
    /**
     * User's date of birth. Drives `isMinor`, `ageYears`, and `guardianStatus`
     * via the pre-save and pre-findOneAndUpdate/updateOne/updateMany hooks.
     *
     * **CALLER REQUIREMENT:** When updating DOB via `findOneAndUpdate`,
     * `updateOne`, or `updateMany`, callers MUST pass `{ runValidators: true }`
     * to the query options. Otherwise the schema validator below is bypassed
     * and malformed dates (NaN, future, > 120y past) will land on disk — the
     * pre-query hook will still recompute `ageYears`/`isMinor` from the raw
     * value, producing garbage derived fields.
     *
     * Example (correct):
     *   User.findByIdAndUpdate(id, { dateOfBirth }, { runValidators: true, new: true })
     *
     * Save paths (`new User({...}).save()`, `user.dateOfBirth = ...; user.save()`)
     * run the validator automatically — no extra flag needed.
     */
    dateOfBirth: {
      type: Date,
      validate: {
        validator: function (v: Date | undefined | null): boolean {
          if (v == null) return true; // optional field — null/undefined always OK
          if (!(v instanceof Date) || isNaN(v.getTime())) return false;
          const now = Date.now();
          const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
          // Must be in the past and no more than 120 years ago
          return v.getTime() <= now && v.getTime() >= now - 120 * MS_PER_YEAR;
        },
        message: 'dateOfBirth must be a valid past date within the last 120 years',
      },
    },
    isMinor:        { type: Boolean, default: false },
    ageYears:       { type: Number },
    guardian:       { type: GuardianSubSchema },
    guardianStatus: {
      type:    String,
      enum:    ['none', 'pending', 'confirmed', 'revoked'],
      default: 'none',
    },

    referralCode: { type: String, index: true },

    devices: { type: [DeviceSubSchema], default: [] },

    cached: { type: UserCachedSchema, default: {} },

    settings: { type: UserSettingsSchema, default: () => ({}) },

    // Registration personalization
    intent: {
      type: [String],
      enum: ['find_gigs', 'hire_artists', 'learn_workshops', 'host_events'],
      default: []
    },
    experienceLevel: { type: String, enum: ['beginner', 'intermediate', 'professional'], default: undefined },

    // Profile Fields
    headline: { type: String },
    bio: { type: String },
    location: { type: String },
    skills: { type: [String], default: [] },
    experience: { type: [ExperienceSubSchema], default: [] },
    artistType: { type: [String], default: [] }, // Multi-select
    instagramHandle: { type: String },
    youtubeUrl: { type: String },
    spotifyUrl: { type: String },
    soundcloudUrl: { type: String },

    // Physical Attributes
    age: { type: String },
    gender: { type: String },
    height: { type: String },
    skinTone: { type: String },

    // Media URLs (stored as URLs only - no binary data)
    hasPhotos: { type: Boolean, default: false },
    galleryUrls: { type: [String], default: [] },  // Up to 5 photo URLs
    videoUrls: { type: [String], default: [] }     // Up to 3 video URLs
  },
  { timestamps: true }
);

// ---------------------------------------------------------------------------
// Shared age-derivation helper — used by both pre('save') and pre-query hooks.
// ---------------------------------------------------------------------------
function deriveAgeFields(
  dateOfBirth: Date | null | undefined,
  currentGuardianStatus: GuardianStatus | undefined,
): { ageYears: number | undefined; isMinor: boolean; guardianStatus: GuardianStatus } {
  if (!dateOfBirth || !(dateOfBirth instanceof Date) || isNaN(dateOfBirth.getTime())) {
    return {
      ageYears:      undefined,
      isMinor:       false,
      guardianStatus: currentGuardianStatus ?? 'none',
    };
  }
  const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
  const years = Math.floor((Date.now() - dateOfBirth.getTime()) / MS_PER_YEAR);
  const minor = years < 18;
  let guardianStatus: GuardianStatus = currentGuardianStatus ?? 'none';
  // Only advance from 'none' to 'pending' — never override confirmed/revoked.
  if (minor && guardianStatus === 'none') {
    guardianStatus = 'pending';
  }
  return { ageYears: years, isMinor: minor, guardianStatus };
}

// Pre-save hook: derive ageYears / isMinor / guardianStatus from dateOfBirth
UserSchema.pre('save', function (next) {
  if (this.isNew || this.isModified('dateOfBirth')) {
    const dob = this.dateOfBirth as Date | undefined;
    const { ageYears, isMinor, guardianStatus } = deriveAgeFields(dob, this.guardianStatus);
    this.ageYears      = ageYears;
    this.isMinor       = isMinor;
    this.guardianStatus = guardianStatus;
  }
  next();
});

// Pre-query hooks: mirror the same derivation for findOneAndUpdate / updateOne / updateMany.
// These fire when controllers call User.findByIdAndUpdate(...) (e.g. auth.ts:333).
// Without these hooks the age-gate fields would silently go stale on PATCH paths.
UserSchema.pre('findOneAndUpdate', function (this: any, next: (err?: Error) => void) {
  const update: any = this.getUpdate();
  if (!update) return next();
  const target = update.$set ?? update;
  if (!('dateOfBirth' in target)) return next();

  const raw = target.dateOfBirth;
  const dob = raw instanceof Date ? raw : (raw ? new Date(raw) : null);
  const currentGuardianStatus = target.guardianStatus as GuardianStatus | undefined;
  const { ageYears, isMinor, guardianStatus } = deriveAgeFields(dob, currentGuardianStatus);

  if (update.$set) {
    update.$set.ageYears      = ageYears;
    update.$set.isMinor       = isMinor;
    update.$set.guardianStatus = guardianStatus;
  } else {
    update.ageYears      = ageYears;
    update.isMinor       = isMinor;
    update.guardianStatus = guardianStatus;
  }
  next();
});

UserSchema.pre('updateOne', function (this: any, next: (err?: Error) => void) {
  const update: any = this.getUpdate();
  if (!update) return next();
  const target = update.$set ?? update;
  if (!('dateOfBirth' in target)) return next();

  const raw = target.dateOfBirth;
  const dob = raw instanceof Date ? raw : (raw ? new Date(raw) : null);
  const currentGuardianStatus = target.guardianStatus as GuardianStatus | undefined;
  const { ageYears, isMinor, guardianStatus } = deriveAgeFields(dob, currentGuardianStatus);

  if (update.$set) {
    update.$set.ageYears      = ageYears;
    update.$set.isMinor       = isMinor;
    update.$set.guardianStatus = guardianStatus;
  } else {
    update.ageYears      = ageYears;
    update.isMinor       = isMinor;
    update.guardianStatus = guardianStatus;
  }
  next();
});

UserSchema.pre('updateMany', function (this: any, next: (err?: Error) => void) {
  const update: any = this.getUpdate();
  if (!update) return next();
  const target = update.$set ?? update;
  if (!('dateOfBirth' in target)) return next();

  const raw = target.dateOfBirth;
  const dob = raw instanceof Date ? raw : (raw ? new Date(raw) : null);
  const currentGuardianStatus = target.guardianStatus as GuardianStatus | undefined;
  const { ageYears, isMinor, guardianStatus } = deriveAgeFields(dob, currentGuardianStatus);

  if (update.$set) {
    update.$set.ageYears      = ageYears;
    update.$set.isMinor       = isMinor;
    update.$set.guardianStatus = guardianStatus;
  } else {
    update.ageYears      = ageYears;
    update.isMinor       = isMinor;
    update.guardianStatus = guardianStatus;
  }
  next();
});

// Compound indexes for discovery queries (PRD v4 two-context model)
UserSchema.index({ trustTier: 1, 'cached.primaryCity': 1 });
UserSchema.index({ 'cached.featured': 1, 'cached.averageRating': -1 });
UserSchema.index({ referralCode: 1 });
UserSchema.index({ trustScore: -1 });

// Age-gate indexes (PRD v4 §8.3.2)
UserSchema.index({ dateOfBirth: 1 });                    // daily cron: flip isMinor when user turns 18
UserSchema.index({ guardianStatus: 1, isMinor: 1 });     // ops query: pending-guardian minors

const User: Model<IUser> = mongoose.model<IUser>('User', UserSchema);

export default User;
