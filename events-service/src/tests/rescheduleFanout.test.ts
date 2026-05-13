import { fanoutReschedule } from '../services/rescheduleFanout.service';
import EventRegistration from '../models/EventRegistration';

jest.mock('../models/EventRegistration');
jest.mock('../services/notificationPublisher.service');

import { publishNotification } from '../services/notificationPublisher.service';

describe('fanoutReschedule', () => {
    beforeEach(() => jest.clearAllMocks());

    it('fans out in 50-chunks with rate limit', async () => {
        const userIds = Array.from({ length: 120 }, (_, i) => `u${i}`);
        (EventRegistration.find as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue(userIds.map((u) => ({ userId: u }))),
            }),
        });

        const r = await fanoutReschedule({
            eventId: 'e1',
            oldStartsAt: '2026-06-01T10:00:00Z',
            newStartsAt: '2026-06-15T10:00:00Z',
            title: 'X',
        });

        expect(r.notified).toBe(120);
        expect(r.batches).toBe(Math.ceil(120 / 50));
        expect(publishNotification).toHaveBeenCalledTimes(120);
    });

    it('handles empty registrant list', async () => {
        (EventRegistration.find as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
        });

        const r = await fanoutReschedule({
            eventId: 'e1',
            oldStartsAt: 'x',
            newStartsAt: 'y',
            title: 'X',
        });
        expect(r.notified).toBe(0);
        expect(publishNotification).not.toHaveBeenCalled();
    });
});
