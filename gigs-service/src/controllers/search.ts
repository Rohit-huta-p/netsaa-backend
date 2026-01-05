import { Request, Response } from 'express';

// Mock Data
const MOCK_GIGS = [
    {
        id: "1",
        title: "Music Video Dancers",
        organizer: "Sony Music",
        location: "Los Angeles, CA",
        type: "Paid Gig",
        posted: "2h ago",
        image: "https://images.unsplash.com/photo-1493225255756-d9584f8606e9?auto=format&fit=crop&w=100&q=80"
    },
    {
        id: "2",
        title: "Contemporary Workshop Lead",
        organizer: "Urban Dance Center",
        location: "Brooklyn, NY",
        type: "Contract",
        posted: "1d ago",
        image: "https://images.unsplash.com/photo-1547153760-18fc86324498?auto=format&fit=crop&w=100&q=80"
    }
];

export const searchGigs = async (req: Request, res: Response) => {
    try {
        const { q } = req.query;
        // Mock filtering
        let results = MOCK_GIGS;
        if (q) {
            const query = (q as string).toLowerCase();
            results = MOCK_GIGS.filter(g =>
                g.title.toLowerCase().includes(query) ||
                g.organizer.toLowerCase().includes(query)
            );
        }
        res.json({ data: results });
    } catch (err: any) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};
