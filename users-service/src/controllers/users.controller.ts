import { Request, Response } from 'express';
import User from '../models/User';

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

        res.json(user);
    } catch (err: any) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'User not found' });
        }
        res.status(500).send('Server error');
    }
};
