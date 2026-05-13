import { sweepReminders } from '../workers/reminders.worker';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';

// Declare module-level holders that will be populated after mock factory runs
// eslint-disable-next-line prefer-const
let redisMockGet: jest.Mock;
// eslint-disable-next-line prefer-const
let redisMockSet: jest.Mock;

jest.mock('../models/Event');
jest.mock('../models/EventRegistration');
jest.mock('../services/notificationPublisher.service');
jest.mock('ioredis', () => {
    const getMock = jest.fn().mockResolvedValue(null);
    const setMock = jest.fn().mockResolvedValue('OK');

    const RedisMock = jest.fn().mockImplementation(() => ({
        get: getMock,
        set: setMock,
        quit: jest.fn(),
    }));

    // Expose mocks so tests can reach them
    (RedisMock as any).__getMock = getMock;
    (RedisMock as any).__setMock = setMock;

    return RedisMock;
});

import { publishNotification } from '../services/notificationPublisher.service';

// Grab the mock refs after jest.mock hoisting is done
// eslint-disable-next-line @typescript-eslint/no-var-requires
const IORedisMock = require('ioredis');

beforeAll(() => {
    redisMockGet = IORedisMock.__getMock as jest.Mock;
    redisMockSet = IORedisMock.__setMock as jest.Mock;
});

describe('sweepReminders', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset to default: Redis returns null (not yet sent)
        redisMockGet.mockResolvedValue(null);
        redisMockSet.mockResolvedValue('OK');
    });

    it('finds events in T-24h window and fires reminders', async () => {
        const inWindow = new Date(Date.now() + 24 * 3600_000);
        (Event.find as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([
                    { _id: 'e1', startsAt: inWindow, title: 'Audition', status: 'live' },
                ]),
            }),
        });
        (EventRegistration.find as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([
                    { _id: 'r1', userId: 'u1' },
                    { _id: 'r2', userId: 'u2' },
                ]),
            }),
        });

        const result = await sweepReminders('reminder_24h');
        expect(publishNotification).toHaveBeenCalledTimes(2);
        expect(publishNotification).toHaveBeenCalledWith(expect.objectContaining({
            subtype: 'event.reminder_24h',
            eventId: 'e1',
            userId: 'u1',
        }));
        expect(result.remindersSent).toBe(2);
        expect(result.eventsProcessed).toBe(1);
    });

    it('skips events already marked in redis idempotency key', async () => {
        const inWindow = new Date(Date.now() + 24 * 3600_000);
        (Event.find as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([
                    { _id: 'e1', startsAt: inWindow, title: 'A', status: 'live' },
                ]),
            }),
        });

        // Redis returns 'sent' = already processed (idempotency guard)
        redisMockGet.mockResolvedValue('sent');

        const result = await sweepReminders('reminder_24h');
        expect(publishNotification).not.toHaveBeenCalled();
        expect(result.eventsProcessed).toBe(0);
        expect(result.remindersSent).toBe(0);
    });
});
