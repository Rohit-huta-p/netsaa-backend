import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User, { IUser } from '../models/User';
import { AuthRequest } from '../middleware/auth';

export const registerWithEmail = async (req: Request, res: Response) => {
  try {
    const { name, email, password, userType, phoneNumber } = req.body;

    if (!email || !password) {
      return res.status(400).json({ msg: 'Please provide email and password' });
    }

    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ msg: 'User already exists' });
    }

    user = new User({
      displayName: name, // mapped to new schema
      email,
      phoneNumber,
      passwordHash: password, // temporarily storing plain or will hash below
      role: userType || 'artist', // mapped to new schema
      authProvider: 'email'
    });

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(password, salt);

    await user.save();

    const payload = {
      user: {
        id: user.id,
        role: user.role,
      },
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET as string,
      { expiresIn: 360000 },
      (err, token) => {
        if (err) throw err;
        const userObj = user.toObject();
        res.json({ token, user: { ...userObj, id: user._id } });
      }
    );
  } catch (err: any) {
    console.error(err.message);
    res.status(500).send('Server error');
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
