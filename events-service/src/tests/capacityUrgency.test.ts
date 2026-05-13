import { sweepUrgency } from '../workers/capacityUrgency.worker';
import Event from '../models/Event';

jest.mock('../models/Event');
jest.mock('../services/notificationPublisher.service');
jest.mock('ioredis', () => {
    const setMock = jest.fn().mockResolvedValue('OK');
    const getMock = jest.fn().mockResolvedValue(null);
    return jest.fn().mockImplementation(() => ({ set: setMock, get: getMock, quit: jest.fn() }));
});

import { publishNotification } from '../services/notificationPublisher.service';

describe('sweepUrgency', () => {
    beforeEach(() => jest.clearAllMocks());

    it('flags events at >= 90% capacity, skips below', async () => {
        (Event.aggregate as jest.Mock).mockResolvedValue([
            { _id: 'e1', title: 'Hot', organizerId: 'org1', capacity: { total: 50, registeredCount: 47 }, fillRatio: 0.94 },
        ]);

        const r = await sweepUrgency();
        expect(r.flagged).toBe(1);
        expect(publishNotification).toHaveBeenCalledWith(expect.objectContaining({
            subtype: 'event.capacity_urgency',
            eventId: 'e1',
        }));
    });

    it('returns 0 when no events match threshold', async () => {
        (Event.aggregate as jest.Mock).mockResolvedValue([]);
        const r = await sweepUrgency();
        expect(r.flagged).toBe(0);
        expect(publishNotification).not.toHaveBeenCalled();
    });
});
