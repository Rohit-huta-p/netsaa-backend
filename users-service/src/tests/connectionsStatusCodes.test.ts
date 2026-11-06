// src/tests/connectionsStatusCodes.test.ts
//
// ConnectionsService.rejectRequest: the HTTP status codes the controller now
// surfaces (404 gone / 403 not-yours / 409 already-moved-on) and idempotency
// (already-rejected resolves instead of erroring). rejectRequest is the exact
// path behind the reported "Connection request not found" on a stale row.
// (acceptRequest uses the same ConnectionError plumbing + a symmetric
// already-accepted idempotent early-return.)

const mockConnectionFindById = jest.fn();

jest.mock('../connections/connections.model', () => ({
    __esModule: true,
    default: { findById: (...a: any[]) => mockConnectionFindById(...a) },
}));

jest.mock('../connections/conversations.model', () => ({
    __esModule: true,
    default: { findOne: jest.fn() },
}));

// Stub notification events so the service doesn't need Redis at import.
jest.mock('../notifications', () => ({
    notificationEvents: { emitConnectionRequested: jest.fn(), emitConnectionAccepted: jest.fn() },
}));

import connectionsService from '../connections/connections.service';
import { ConnectionError } from '../connections/connections.errors';

const RECIPIENT = 'recipient-1';
const REQUESTER = 'requester-2';

const makeConnection = (status: string) => ({
    _id: 'conn-1',
    requesterId: { toString: () => REQUESTER },
    recipientId: { toString: () => RECIPIENT },
    status,
    save: jest.fn().mockResolvedValue(undefined),
});

beforeEach(() => jest.clearAllMocks());

describe('ConnectionsService.rejectRequest — status codes + idempotency', () => {
    it('404 when the request no longer exists (the stale-UI case)', async () => {
        mockConnectionFindById.mockResolvedValue(null);
        await expect(connectionsService.rejectRequest('gone', RECIPIENT)).rejects.toMatchObject({ status: 404 });
    });

    it('404 error is a ConnectionError (carries the HTTP status for the controller)', async () => {
        mockConnectionFindById.mockResolvedValue(null);
        await expect(connectionsService.rejectRequest('gone', RECIPIENT)).rejects.toBeInstanceOf(ConnectionError);
    });

    it('403 when the caller is not the recipient', async () => {
        mockConnectionFindById.mockResolvedValue(makeConnection('pending'));
        await expect(connectionsService.rejectRequest('conn-1', 'someone-else')).rejects.toMatchObject({ status: 403 });
    });

    it('idempotent: already rejected → resolves without re-saving', async () => {
        const conn = makeConnection('rejected');
        mockConnectionFindById.mockResolvedValue(conn);
        await expect(connectionsService.rejectRequest('conn-1', RECIPIENT)).resolves.toBe(conn);
        expect(conn.save).not.toHaveBeenCalled();
    });

    it('409 when the connection has moved on (accepted)', async () => {
        mockConnectionFindById.mockResolvedValue(makeConnection('accepted'));
        await expect(connectionsService.rejectRequest('conn-1', RECIPIENT)).rejects.toMatchObject({ status: 409 });
    });

    it('pending → transitions to rejected and saves', async () => {
        const conn = makeConnection('pending');
        mockConnectionFindById.mockResolvedValue(conn);
        await connectionsService.rejectRequest('conn-1', RECIPIENT);
        expect(conn.status).toBe('rejected');
        expect(conn.save).toHaveBeenCalledTimes(1);
    });
});
