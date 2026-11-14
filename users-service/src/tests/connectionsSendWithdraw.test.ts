// src/tests/connectionsSendWithdraw.test.ts
//
// ConnectionsService.sendRequest re-send-after-decline (revive a rejected row into
// a fresh pending request + notify, instead of 409'ing forever) and the new
// withdrawRequest path (requester cancels a pending request → delete + clear the
// recipient's notification). These are the exact services behind "A re-sends after
// B declines and B never sees it" and the dead PATCH /:id/withdraw endpoint.

const mockFindOne = jest.fn();
const mockCreate = jest.fn();
const mockFindById = jest.fn();
const mockFindByIdAndDelete = jest.fn();

jest.mock('../connections/connections.model', () => ({
    __esModule: true,
    default: {
        findOne: (...a: any[]) => mockFindOne(...a),
        create: (...a: any[]) => mockCreate(...a),
        findById: (...a: any[]) => mockFindById(...a),
        findByIdAndDelete: (...a: any[]) => mockFindByIdAndDelete(...a),
    },
}));

jest.mock('../connections/conversations.model', () => ({
    __esModule: true,
    default: { findOne: jest.fn() },
}));

const mockEmit = jest.fn();
const mockNotifDeleteMany = jest.fn();
jest.mock('../notifications', () => ({
    notificationEvents: {
        emitConnectionRequested: (...a: any[]) => mockEmit(...a),
        emitConnectionAccepted: jest.fn(),
    },
    Notification: { updateOne: jest.fn(), deleteMany: (...a: any[]) => mockNotifDeleteMany(...a) },
    ConnectionSubtype: { REQUEST: 'connection.request' },
}));

import connectionsService from '../connections/connections.service';
import { ConnectionError } from '../connections/connections.errors';

const A = 'aaaaaaaaaaaaaaaaaaaaaaaa'; // requester
const B = 'bbbbbbbbbbbbbbbbbbbbbbbb'; // recipient

const makeExisting = (status: string, requesterId = A, recipientId = B) => ({
    _id: { toString: () => 'conn-1' },
    requesterId: { toString: () => requesterId },
    recipientId: { toString: () => recipientId },
    status,
    message: 'old declined note',
    save: jest.fn().mockResolvedValue(undefined),
});

beforeEach(() => jest.clearAllMocks());

describe('ConnectionsService.sendRequest — re-send after decline', () => {
    it('revives a rejected request into a fresh pending one and notifies (no 409)', async () => {
        const existing = makeExisting('rejected');
        mockFindOne.mockResolvedValue(existing);

        const result = await connectionsService.sendRequest(A, B, 'hi again');

        expect(existing.status).toBe('pending');          // revived, not left rejected
        expect(existing.message).toBe('hi again');        // stale note replaced
        expect(existing.save).toHaveBeenCalledTimes(1);
        expect(mockCreate).not.toHaveBeenCalled();        // reused the row (unique index)
        expect(mockEmit).toHaveBeenCalledTimes(1);        // recipient gets a fresh notification
        expect(result).toBe(existing);
    });

    it('409 when a pending request already exists', async () => {
        mockFindOne.mockResolvedValue(makeExisting('pending'));
        await expect(connectionsService.sendRequest(A, B)).rejects.toMatchObject({ status: 409 });
    });

    it('409 when the two are already connected (accepted)', async () => {
        mockFindOne.mockResolvedValue(makeExisting('accepted'));
        await expect(connectionsService.sendRequest(A, B)).rejects.toMatchObject({ status: 409 });
    });

    it('403 when blocked', async () => {
        mockFindOne.mockResolvedValue(makeExisting('blocked'));
        await expect(connectionsService.sendRequest(A, B)).rejects.toMatchObject({ status: 403 });
    });

    it('creates a brand-new request when no prior connection exists', async () => {
        mockFindOne.mockResolvedValue(null);
        const created = { _id: { toString: () => 'new-1' } };
        mockCreate.mockResolvedValue(created);

        const result = await connectionsService.sendRequest(A, B, 'hello');

        expect(mockCreate).toHaveBeenCalledTimes(1);
        expect(mockEmit).toHaveBeenCalledTimes(1);
        expect(result).toBe(created);
    });

    it('400 when sending to self', async () => {
        await expect(connectionsService.sendRequest(A, A)).rejects.toBeInstanceOf(ConnectionError);
        await expect(connectionsService.sendRequest(A, A)).rejects.toMatchObject({ status: 400 });
    });
});

describe('ConnectionsService.withdrawRequest', () => {
    it('404 when the request no longer exists', async () => {
        mockFindById.mockResolvedValue(null);
        await expect(connectionsService.withdrawRequest('gone', A)).rejects.toMatchObject({ status: 404 });
    });

    it('403 when the caller is not the requester (only the sender may withdraw)', async () => {
        mockFindById.mockResolvedValue(makeExisting('pending'));
        await expect(connectionsService.withdrawRequest('conn-1', B)).rejects.toMatchObject({ status: 403 });
    });

    it('409 when the pair is already connected (accepted)', async () => {
        mockFindById.mockResolvedValue(makeExisting('accepted'));
        await expect(connectionsService.withdrawRequest('conn-1', A)).rejects.toMatchObject({ status: 409 });
    });

    it('pending → deletes the row and clears the recipient notification', async () => {
        mockFindById.mockResolvedValue(makeExisting('pending'));
        mockFindByIdAndDelete.mockResolvedValue(undefined);

        await connectionsService.withdrawRequest('conn-1', A);

        expect(mockFindByIdAndDelete).toHaveBeenCalledWith('conn-1');
        expect(mockNotifDeleteMany).toHaveBeenCalledTimes(1);
    });
});
