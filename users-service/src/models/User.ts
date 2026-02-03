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
  otp?: string; // legacy support / simple phone auth
  otpExpires?: number | Date; // legacy support
  createdAt: Date;
  updatedAt: Date;

  // Profile Fields
  bio?: string;
  location?: string;
  skills?: string[];
  experience?: string[];
  artistType?: string;
  instagramHandle?: string;

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
  { _id: false }
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
    referralCode: { type: String, index: true },

    devices: { type: [DeviceSubSchema], default: [] },

    cached: { type: UserCachedSchema, default: {} },

    // Legacy / simple phone auth fields
    otp: { type: String },
    otpExpires: { type: Date },

    // Profile Fields
    bio: { type: String },
    location: { type: String },
    skills: { type: [String], default: [] },
    experience: { type: [String], default: [] },
    artistType: { type: String },
    instagramHandle: { type: String },

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
