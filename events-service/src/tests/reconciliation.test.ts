import { detectAndFixDrift } from '../services/reconciliation.service';
import Event from '../models/Event';

jest.mock('../models/Event');

describe('reconciliation.service.detectAndFixDrift', () => {
    it('returns 0 drifts when aggregate finds no mismatches', async () => {
        (Event.aggregate as jest.Mock).mockResolvedValue([]);
        const r = await detectAndFixDrift();
        expect(r.driftCount).toBe(0);
        expect(r.totalEvents).toBe(0);
        expect(Event.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('fixes each drifted event with stored=registeredCount', async () => {
        const e1 = '507f1f77bcf86cd799439011';
        const e2 = '507f1f77bcf86cd799439012';
        (Event.aggregate as jest.Mock).mockResolvedValueOnce([
            { _id: e1, stored: 32, computed: 30 },
            { _id: e2, stored: 50, computed: 48 },
        ]);
        (Event.aggregate as jest.Mock).mockResolvedValueOnce([{ count: 200 }]);
        (Event.findByIdAndUpdate as jest.Mock).mockResolvedValue({});

        const r = await detectAndFixDrift();
        expect(r.driftCount).toBe(2);
        expect(r.totalEvents).toBe(200);
        expect(Event.findByIdAndUpdate).toHaveBeenCalledWith(e1, {
            'capacity.registeredCount': 30,
        });
        expect(Event.findByIdAndUpdate).toHaveBeenCalledWith(e2, {
            'capacity.registeredCount': 48,
        });
    });

    it('returns alertWorthy=true when drift > 1% of events', async () => {
        (Event.aggregate as jest.Mock).mockResolvedValueOnce([
            ...Array.from({ length: 5 }, (_, i) => ({
                _id: `id${i}`,
                stored: 10,
                computed: 9,
            })),
        ]);
        (Event.aggregate as jest.Mock).mockResolvedValueOnce([{ count: 100 }]);
        (Event.findByIdAndUpdate as jest.Mock).mockResolvedValue({});

        const r = await detectAndFixDrift();
        expect(r.alertWorthy).toBe(true);
    });

    it('returns alertWorthy=false when drift <= 1%', async () => {
        (Event.aggregate as jest.Mock).mockResolvedValueOnce([
            { _id: 'id1', stored: 10, computed: 9 },
        ]);
        (Event.aggregate as jest.Mock).mockResolvedValueOnce([{ count: 1000 }]);
        (Event.findByIdAndUpdate as jest.Mock).mockResolvedValue({});

        const r = await detectAndFixDrift();
        expect(r.alertWorthy).toBe(false);
    });
});
