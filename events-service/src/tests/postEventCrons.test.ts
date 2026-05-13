import { sweepMarkAttendees } from '../workers/markAttendees.worker';
import { sweepAutoComplete } from '../workers/autoComplete.worker';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';

jest.mock('../models/Event');
jest.mock('../models/EventRegistration');
jest.mock('../services/notificationPublisher.service');
jest.mock('ioredis', () => jest.fn().mockImplementation(() => ({
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    quit: jest.fn(),
})));

import { publishNotification } from '../services/notificationPublisher.service';

describe('sweepMarkAttendees (T+24h)', () => {
    beforeEach(() => jest.clearAllMocks());

    it('pushes "mark attendees" to organizers of events 24h past startsAt', async () => {
        (Event.find as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([
                    { _id: 'e1', organizerId: 'org1', title: 'X', startsAt: new Date(Date.now() - 25 * 3600_000) },
                ]),
            }),
        });

        const r = await sweepMarkAttendees();
        expect(r.pushed).toBe(1);
        expect(publishNotification).toHaveBeenCalledWith(expect.objectContaining({
            subtype: 'event.mark_attendees_prompt',
            organizerId: 'org1',
        }));
    });
});

describe('sweepAutoComplete (T+72h)', () => {
    beforeEach(() => jest.clearAllMocks());

    it('flips confirmed→attended + event live→completed', async () => {
        (Event.find as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([
                    { _id: 'e1', startsAt: new Date(Date.now() - 73 * 3600_000), status: 'live' },
                ]),
            }),
        });
        (EventRegistration.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 5 });
        (Event.findByIdAndUpdate as jest.Mock).mockResolvedValue({});

        const r = await sweepAutoComplete();
        expect(r.eventsCompleted).toBe(1);
        expect(EventRegistration.updateMany).toHaveBeenCalledWith(
            { eventId: 'e1', status: 'confirmed' },
            { $set: { status: 'attended', attendedMarkedAt: expect.any(Date), attendedMarkedBy: 'system' } }
        );
        expect(Event.findByIdAndUpdate).toHaveBeenCalledWith('e1', { status: 'completed' });
    });
});
