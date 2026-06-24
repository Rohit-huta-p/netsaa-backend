import { Request, Response } from 'express';
import User from '../models/User';
import Organizer from '../models/Organizer';
import Artist from '../models/Artist';

export const getUserById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        // Check if ID is valid format (optional but good practice)
        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ msg: 'Invalid user ID' });
        }

        const user = await User.findById(id).select('-passwordHash -otp -otpExpires');

        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        const userObj = user.toObject() as any;
        if (user.role === 'creative_lead' || user.role === 'client') {
            const organizerDetails = await Organizer.findOne({ userId: user._id });
            if (organizerDetails) userObj.organizerDetails = organizerDetails;
        }

        // Tiered, privacy-safe public profile for clients (Part D, 2026-06).
        // This is a PUBLIC endpoint (no `protect`, no owner concept) — the owner
        // reads their own editable data via /me + /organizers/me. We must NEVER
        // surface email / phoneNumber / billingDetails / otp* here. Lean tier for
        // individual/company/venue; agency adds showcase fields only.
        if (user.role === 'client') {
            const org = userObj.organizerDetails as any | undefined;
            const clientDto: Record<string, any> = {
                _id: userObj._id,
                displayName: userObj.displayName,
                role: 'client',
                profileImageUrl: userObj.profileImageUrl,
                city: userObj.cached?.primaryCity || userObj.location,
                verified: !!userObj.phoneVerifiedAt,
                joined: userObj.createdAt,
                organizationName: org?.organizationName,
                organizerTypeCategory: org?.organizerTypeCategory,
            };
            if (org?.organizerTypeCategory === 'agency') {
                clientDto.logoUrl = org.logoUrl;
                clientDto.organizationWebsite = org.organizationWebsite;
                clientDto.bio = org.bio;
                clientDto.services = org.services;
                clientDto.photos = org.photos;
                clientDto.yearsInBusiness = org.yearsInBusiness;
                clientDto.teamSize = org.teamSize;
            }
            return res.json(clientDto);
        }

        if (user.role === 'creative_lead' || user.role === 'artist') {
            const artistDetails = await Artist.findOne({ userId: user._id });
            if (artistDetails) userObj.artistDetails = artistDetails;
        }

        res.json(userObj);
    } catch (err: any) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'User not found' });
        }
        res.status(500).send('Server error');
    }
};
