import { Request, Response } from 'express';

// Mock Data
const MOCK_EVENTS = [
    {
        id: "1",
        title: "Street Dance Battle 2024",
        date: "Sat, Dec 28 • 6:00 PM",
        attendees: 142,
        type: "Competition"
    },
    {
        id: "2",
        title: "Networking Mixer",
        date: "Fri, Jan 5 • 8:00 PM",
        attendees: 56,
        type: "Networking"
    }
];

export const searchEvents = async (req: Request, res: Response) => {
    try {
        const { q } = req.query;
        // Mock filtering
        let results = MOCK_EVENTS;
        if (q) {
            const query = (q as string).toLowerCase();
            results = MOCK_EVENTS.filter(e =>
                e.title.toLowerCase().includes(query) ||
                e.type.toLowerCase().includes(query)
            );
        }
        res.json({ data: results });
    } catch (err: any) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};
