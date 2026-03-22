import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User, { IUser } from '../models/User';
import Artist from '../models/Artist';
import Organizer from '../models/Organizer';
import PasswordResetSession from '../models/PasswordResetSession';
import { AuthRequest } from '../middleware/auth';
import { registerSchema } from '../validators/register.dto';
import { emailQueue } from '../email/email.queue';

export const checkEmail = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ msg: 'Email is required' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.json({ exists: true });
    }

    return res.json({ exists: false });
  } catch (err: any) {
    console.error('Check email failed:', err.message);
    res.status(500).json({ msg: 'Server error while checking email' });
  }
};

export const checkPhone = async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ msg: 'Phone number is required' });
    }

    const existing = await User.findOne({ phoneNumber: phone });
    if (existing) {
      return res.json({ exists: true });
    }

    return res.json({ exists: false });
  } catch (err: any) {
    console.error('Check phone failed:', err.message);
    res.status(500).json({ msg: 'Server error while checking phone' });
  }
};

export const registerWithEmail = async (req: Request, res: Response) => {
  /* -------- Validate incoming payload -------- */
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    const errors = parsed.error.flatten();
    return res.status(400).json({ msg: 'Validation failed', errors });
  }

  const { user: userInput, organizerProfile } = parsed.data;

  /* -------- Check for duplicate email (before opening session) -------- */
  const existing = await User.findOne({ email: userInput.email });
  if (existing) {
    return res.status(400).json({ msg: 'User already exists' });
  }

  /* -------- Hash password -------- */
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(userInput.password, salt);

  const role = userInput.role || 'artist';

  /* ════════════════════════════════════════════════════ */
  /*  Transaction: User + Role-specific record           */
  /* ════════════════════════════════════════════════════ */
  const session = await mongoose.startSession();

  try {
    let savedUser: any;

    await session.withTransaction(async () => {
      /* -------- 1. Create User document -------- */
      const [user] = await User.create(
        [
          {
            displayName: userInput.displayName,
            email: userInput.email,
            phoneNumber: userInput.phoneNumber || null,
            passwordHash,
            role,
            authProvider: 'email',
            marketingConsent: userInput.marketingConsent
              ? {
                accepted: true,
                acceptedAt: new Date(),
                source: 'registration' as const,
                policyVersion: 'v1.0',
              }
              : { accepted: false, acceptedAt: null },
            ...(role === 'organizer' && organizerProfile?.intent && {
              intent: organizerProfile.intent,
            }),
          },
        ],
        { session }
      );

      /* -------- 2. Create role-specific record -------- */
      if (role === 'artist') {
        await Artist.create(
          [
            {
              userId: user._id,
              userName: userInput.displayName,
            },
          ],
          { session }
        );
      } else if (role === 'organizer' && organizerProfile) {
        await Organizer.create(
          [
            {
              userId: user._id,
              organizerTypeCategory: organizerProfile.organizerTypeCategory,
              organizationName: organizerProfile.organizationName,
              organizationType: organizerProfile.organizationType,
              isCustomCategory: organizerProfile.isCustomCategory ?? false,
              customCategoryLabel: organizerProfile.customCategoryLabel,
              organizationWebsite: organizerProfile.organizationWebsite,
              logoUrl: organizerProfile.logoUrl,
              billingDetails: organizerProfile.billingDetails || {},
            },
          ],
          { session }
        );
      }

      savedUser = user;
    });

    /* -------- Enqueue welcome email (non-blocking) -------- */
    emailQueue.add('welcome-email', {
      userId: String(savedUser._id),
      email: savedUser.email,
      displayName: savedUser.displayName ?? savedUser.email,
      role: savedUser.role,
    }).catch((err) => console.error('[Auth] Failed to enqueue welcome-email:', err.message));

    /* -------- Issue JWT -------- */
    const payload = {
      user: {
        id: savedUser._id,
        role: savedUser.role,
        displayName: savedUser.displayName,
        email: savedUser.email,
        profileImageUrl: savedUser.profileImageUrl,
        primaryCity: savedUser.cached?.primaryCity,
        kycStatus: savedUser.kycStatus,
      },
    };

    const userObj = savedUser.toObject() as any;
    if (savedUser.role === 'organizer') {
      const organizerDetails = await Organizer.findOne({ userId: savedUser._id });
      if (organizerDetails) userObj.organizerDetails = organizerDetails;
    } else if (savedUser.role === 'artist') {
      const artistDetails = await Artist.findOne({ userId: savedUser._id });
      if (artistDetails) userObj.artistDetails = artistDetails;
    }

    jwt.sign(
      payload,
      process.env.JWT_SECRET as string,
      { expiresIn: 360000 },
      (err, token) => {
        if (err) throw err;
        res.json({ token, user: { ...userObj, id: savedUser._id } });
      }
    );
  } catch (err: any) {
    console.error('Registration transaction failed:', err.message);
    res.status(500).json({ msg: 'Registration failed. Please try again.' });
  } finally {
    await session.endSession();
  }
};

export const loginWithEmail = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    console.log("AUTH CONTROLLER: Logging in...")
    let user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    console.log("AUTH CONTROLLER: Found user", user)
    if (!user.passwordHash) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    if (user.accountStatus === 'deactivated') {
      user.accountStatus = 'active';
      user.blocked = false;
      await user.save();
    }


    const payload = {
      user: {
        id: user.id,
        role: user.role,
        displayName: user.displayName,
        email: user.email,
        profileImageUrl: user.profileImageUrl,
        primaryCity: user.cached?.primaryCity,
        kycStatus: user.kycStatus,
      },
    };

    const userObj = user.toObject() as any;
    if (user.role === 'organizer') {
      const organizerDetails = await Organizer.findOne({ userId: user._id });
      if (organizerDetails) userObj.organizerDetails = organizerDetails;
    } else if (user.role === 'artist') {
      const artistDetails = await Artist.findOne({ userId: user._id });
      if (artistDetails) userObj.artistDetails = artistDetails;
    }

    jwt.sign(
      payload,
      process.env.JWT_SECRET as string,
      { expiresIn: 360000 },
      (err, token) => {
        if (err) throw err;
        console.log("AUTH CONTROLLER: Login successful")
        res.json({ token, user: { ...userObj, id: user._id } });
      }
    );
  } catch (err: any) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};



export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ msg: 'Not authorized' });
    }
    // We already attached user in middleware, but typically we might just return it
    // Or fetch explicitly if needed (though middleware did that).
    // The middleware attached the full user document.
    const user = await User.findById(req.user.id).select('-passwordHash');
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    const userObj = user.toObject() as any;
    if (user.role === 'organizer') {
      const organizerDetails = await Organizer.findOne({ userId: user._id });
      if (organizerDetails) userObj.organizerDetails = organizerDetails;

    } else if (user.role === 'artist') {
      const artistDetails = await Artist.findOne({ userId: user._id });
      if (artistDetails) userObj.artistDetails = artistDetails;
    }
    console.log("AUTH CONTROLLER: getMe userObj:", userObj);
    res.json(userObj);
  } catch (err: any) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

export const updateMe = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    console.log("AUTH CONTROLLER: updateMe body:", req.body);

    const {
      displayName,
      profileImageUrl,
      // Media fields (URLs only - no binary data)
      galleryUrls,
      videoUrls,
      hasPhotos,
      // Profile fields
      bio,
      location,
      skills,
      experience,
      artistType,
      instagramHandle,
      youtubeUrl,
      spotifyUrl,
      soundcloudUrl,
      age,
      gender,
      height,
      skinTone,
      headline
    } = req.body;

    // Build update object
    const updateFields: any = {};
    if (displayName !== undefined) updateFields.displayName = displayName;
    if (profileImageUrl !== undefined) updateFields.profileImageUrl = profileImageUrl;
    // Media fields
    if (galleryUrls !== undefined) updateFields.galleryUrls = galleryUrls;
    if (videoUrls !== undefined) updateFields.videoUrls = videoUrls;
    if (hasPhotos !== undefined) updateFields.hasPhotos = hasPhotos;
    // Profile fields
    if (bio !== undefined) updateFields.bio = bio;
    if (location !== undefined) updateFields.location = location;
    if (skills !== undefined) updateFields.skills = skills;
    if (experience !== undefined) updateFields.experience = experience;
    if (artistType !== undefined) updateFields.artistType = artistType;
    if (instagramHandle !== undefined) updateFields.instagramHandle = instagramHandle;
    if (youtubeUrl !== undefined) updateFields.youtubeUrl = youtubeUrl;
    if (spotifyUrl !== undefined) updateFields.spotifyUrl = spotifyUrl;
    if (soundcloudUrl !== undefined) updateFields.soundcloudUrl = soundcloudUrl;
    if (age !== undefined) updateFields.age = age;
    if (gender !== undefined) updateFields.gender = gender;
    if (height !== undefined) updateFields.height = height;
    if (skinTone !== undefined) updateFields.skinTone = skinTone;
    if (headline !== undefined) updateFields.headline = headline;

    console.log("AUTH CONTROLLER: updating fields:", updateFields);

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateFields },
      { new: true, runValidators: true }
    ).select('-passwordHash');

    console.log("AUTH CONTROLLER: updated user successfully");
    res.json(user);
  } catch (err: any) {
    console.error("AUTH CONTROLLER UPDATE ERROR:", err.message);
    console.error(err);
    res.status(500).send('Server error');
  }
};

/* ════════════════════════════════════════════════════════════ */
/*  PASSWORD RESET                                             */
/* ════════════════════════════════════════════════════════════ */

/**
 * @desc    Request a password-reset code via email
 * @route   POST /auth/forgot-password
 * @access  Public
 */
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ msg: 'Email is required' });
    }

    // Always return success to prevent email enumeration
    const user = await User.findOne({ email });
    if (!user) {
      console.log(`[forgotPassword] No account for email: ${email} — returning generic success`);
      return res.json({ msg: 'If an account exists, a reset code has been sent.' });
    }

    // Rate limit: max 3 active sessions per email in the last 10 minutes
    const recentCount = await PasswordResetSession.countDocuments({
      email,
      createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) },
    });
    if (recentCount >= 3) {
      return res.status(429).json({ msg: 'Too many reset requests. Please wait 10 minutes.' });
    }

    // Generate 6-digit code and hash it
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');

    // Create reset session (10-minute expiry)
    await PasswordResetSession.create({
      email,
      codeHash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0,
      isUsed: false,
    });

    // Enqueue password-reset email
    emailQueue.add('password-reset', {
      userId: String(user._id),
      email: user.email,
      displayName: user.displayName ?? user.email,
      code,
    }).catch((err) => console.error('[Auth] Failed to enqueue password-reset email:', err.message));

    console.log(`[forgotPassword] Reset code enqueued for ${email}`);
    return res.json({ msg: 'If an account exists, a reset code has been sent.' });
  } catch (err: any) {
    console.error('[forgotPassword] Error:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};

/**
 * @desc    Reset password using the emailed code
 * @route   POST /auth/reset-password
 * @access  Public
 */
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ msg: 'Email, code, and new password are required.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ msg: 'Password must be at least 8 characters.' });
    }

    // Find the latest unused session
    const session = await PasswordResetSession.findOne({
      email,
      isUsed: false,
    }).sort({ createdAt: -1 });

    if (!session) {
      return res.status(400).json({ msg: 'No active reset session found. Please request a new code.' });
    }

    if (session.expiresAt < new Date()) {
      return res.status(400).json({ msg: 'Reset code has expired. Please request a new one.' });
    }

    if (session.attempts >= 5) {
      return res.status(429).json({ msg: 'Too many attempts. Please request a new code.' });
    }

    // Hash incoming code and compare
    const incomingHash = crypto.createHash('sha256').update(code.toString()).digest('hex');
    if (incomingHash !== session.codeHash) {
      session.attempts += 1;
      await session.save();
      return res.status(400).json({ msg: 'Invalid code. Please try again.' });
    }

    // Mark session as used
    session.isUsed = true;
    await session.save();

    // Hash the new password and update user
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await User.findOneAndUpdate(
      { email },
      { $set: { passwordHash } }
    );

    console.log(`[resetPassword] Password updated for ${email}`);
    return res.json({ msg: 'Password has been reset successfully. You can now sign in.' });
  } catch (err: any) {
    console.error('[resetPassword] Error:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};
