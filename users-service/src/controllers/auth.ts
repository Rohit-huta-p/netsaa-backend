import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User, { IUser } from '../models/User';
import Artist from '../models/Artist';
import Organizer from '../models/Organizer';
import { AuthRequest } from '../middleware/auth';
import { registerSchema } from '../validators/register.dto';

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
              organizationType: organizerProfile.organizationType || [],
              organizationWebsite: organizerProfile.organizationWebsite,
              logoUrl: organizerProfile.logoUrl,
              primaryContact: organizerProfile.primaryContact,
              billingDetails: organizerProfile.billingDetails || {},
            },
          ],
          { session }
        );
      }

      savedUser = user;
    });

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

    jwt.sign(
      payload,
      process.env.JWT_SECRET as string,
      { expiresIn: 360000 },
      (err, token) => {
        if (err) throw err;
        const userObj = savedUser.toObject();
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

    jwt.sign(
      payload,
      process.env.JWT_SECRET as string,
      { expiresIn: 360000 },
      (err, token) => {
        if (err) throw err;
        console.log("AUTH CONTROLLER: Login successful")
        res.json({ token, user: { ...user.toObject(), id: user._id } });
      }
    );
  } catch (err: any) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

export const registerWithPhone = async (req: Request, res: Response) => {
  try {
    const { phone, name, userType } = req.body;

    let user = await User.findOne({ phoneNumber: phone });
    if (user) {
      return res.status(400).json({ msg: 'User already exists' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    user = new User({
      displayName: name,
      phoneNumber: phone,
      role: userType || 'artist',
      otp,
      otpExpires: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      authProvider: 'phone'
    });

    await user.save();

    console.log(`OTP for ${phone} is ${otp}`);

    res.json({ msg: 'OTP sent to your phone' });
  } catch (err: any) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

export const verifyOtpAndLogin = async (req: Request, res: Response) => {
  try {
    const { phone, otp } = req.body;

    let user = await User.findOne({ phoneNumber: phone });
    if (!user) {
      return res.status(400).json({ msg: 'User not found' });
    }

    if (user.otp !== otp || (user.otpExpires && user.otpExpires < new Date())) {
      return res.status(400).json({ msg: 'Invalid or expired OTP' });
    }

    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

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

    jwt.sign(
      payload,
      process.env.JWT_SECRET as string,
      { expiresIn: 360000 },
      (err, token) => {
        if (err) throw err;
        res.json({ token });
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
    res.json(user);
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
      skinTone
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
