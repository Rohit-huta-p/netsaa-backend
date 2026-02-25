import mongoose, { Schema, Document, Model } from 'mongoose';

/* ---------- TypeScript interfaces ---------- */

export type AuthProvider = 'email' | 'google' | 'apple' | 'phone';
export type Role = 'artist' | 'organizer' | 'admin';

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

export interface IUser extends Document {
  displayName?: string;
  email: string;
  phoneNumber?: string;
  authProvider: AuthProvider;
  passwordHash?: string; // optional (SSO flows)
  emailVerifiedAt?: Date;
  phoneVerifiedAt?: Date;
  role: Role;
  profileImageUrl?: string; // small avatar
  kycStatus?: 'none' | 'pending' | 'approved' | 'rejected';
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
  otp?: string; // legacy support / simple phone auth
  otpExpires?: number | Date; // legacy support
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;      // soft-delete timestamp
  deleteReason?: string; // optional reason provided by user

  // Registration personalization
  intent?: ('find_gigs' | 'hire_artists' | 'learn_workshops' | 'host_events')[];
  experienceLevel?: 'beginner' | 'intermediate' | 'professional';

  // Profile Fields
  bio?: string;
  location?: string;
  skills?: string[];
  experience?: Array<{
    title: string;
    role?: string;
    venue?: string;
    date?: string;
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
    title: { type: String, required: true },
    role: { type: String },
    venue: { type: String },
    date: { type: String },
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

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, index: true },
    phoneNumber: { type: String },
    authProvider: { type: String, enum: ['email', 'google', 'apple', 'phone'], default: 'email' },
    passwordHash: { type: String },

    emailVerifiedAt: { type: Date },
    phoneVerifiedAt: { type: Date },

    role: { type: String, enum: ['artist', 'organizer', 'admin'], required: true, index: true },
    displayName: { type: String },
    profileImageUrl: { type: String },

    kycStatus: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none', index: true },
    blocked: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null, index: true },
    deleteReason: { type: String },
    referralCode: { type: String, index: true },

    devices: { type: [DeviceSubSchema], default: [] },

    cached: { type: UserCachedSchema, default: {} },

    settings: { type: UserSettingsSchema, default: () => ({}) },

    // Legacy / simple phone auth fields
    otp: { type: String },
    otpExpires: { type: Date },

    // Registration personalization
    intent: {
      type: [String],
      enum: ['find_gigs', 'hire_artists', 'learn_workshops', 'host_events'],
      default: []
    },
    experienceLevel: { type: String, enum: ['beginner', 'intermediate', 'professional'], default: undefined },

    // Profile Fields
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

// Suggested compound indexes for users (fast discovery queries)
UserSchema.index({ role: 1, 'cached.primaryCity': 1 });
UserSchema.index({ 'cached.featured': 1, 'cached.averageRating': -1 });
UserSchema.index({ referralCode: 1 });

const User: Model<IUser> = mongoose.model<IUser>('User', UserSchema);

export default User;
