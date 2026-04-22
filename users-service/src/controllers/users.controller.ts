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

        // Two-context model: always return both profiles
        const userObj = user.toObject() as any;
        const [artistDetails, organizerDetails] = await Promise.all([
            Artist.findOne({ userId: user._id }),
            Organizer.findOne({ userId: user._id }),
        ]);
        if (artistDetails) userObj.artistDetails = artistDetails;
        if (organizerDetails) userObj.organizerDetails = organizerDetails;

        res.json(userObj);
    } catch (err: any) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'User not found' });
        }
        res.status(500).send('Server error');
    }
};
