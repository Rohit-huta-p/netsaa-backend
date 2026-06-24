// src/tests/messagingContextBypass.test.ts
//
// Verifies that sendMessage bypasses the connection-active guard for
// context-anchored (Choose-originated) conversations, while plain
// DMs between non-connected users still reject.

const mockConnectionFindOne = jest.fn();
const mockConversationFindById = jest.fn();
const mockConversationFindByIdAndUpdate = jest.fn();
const mockMessageFindOne = jest.fn();
const mockMessageCreate = jest.fn();
const mockUserFindById = jest.fn();

jest.mock('../connections/connections.model', () => ({
    __esModule: true,
    default: { findOne: (...a: any[]) => mockConnectionFindOne(...a) },
}));

jest.mock('../connections/conversations.model', () => ({
    __esModule: true,
    default: {
        findById: (...a: any[]) => mockConversationFindById(...a),
        findByIdAndUpdate: (...a: any[]) => mockConversationFindByIdAndUpdate(...a),
    },
}));

jest.mock('../connections/messages.model', () => ({
    __esModule: true,
    default: {
        findOne: (...a: any[]) => mockMessageFindOne(...a),
        create: (...a: any[]) => mockMessageCreate(...a),
    },
}));

jest.mock('../models/User', () => ({
    __esModule: true,
    default: { findById: (...a: any[]) => mockUserFindById(...a) },
}));

// Stub notification events so the service doesn't blow up without Redis
jest.mock('../notifications', () => ({
    notificationEvents: { emitMessageSent: jest.fn() },
}));

import messagesService from '../connections/messages.service';

const SENDER = 'user-client-111';
const OTHER  = 'user-cl-222';

const makeConversation = (withContext: boolean) => ({
    _id: 'conv1',
    participants: [{ toString: () => SENDER }, { toString: () => OTHER }],
    context: withContext
        ? { requirementId: { toString: () => 'req1' }, proposalId: { toString: () => 'prop1' } }
        : undefined,
});

const makeInviteConversation = () => ({
    _id: 'conv2',
    participants: [{ toString: () => SENDER }, { toString: () => OTHER }],
    context: { inviteId: { toString: () => 'invite1' }, label: 'Invite' },
});

const baseRecipientSettings = (allowMessagesFrom: string) => ({
    select: jest.fn().mockResolvedValue({ settings: { messaging: { allowMessagesFrom } } }),
});

beforeEach(() => {
    jest.clearAllMocks();
    mockMessageFindOne.mockResolvedValue(null);           // no duplicate
    mockConversationFindByIdAndUpdate.mockResolvedValue({}); // best-effort, not critical
    mockMessageCreate.mockResolvedValue({ _id: 'msg1', text: 'hello', createdAt: new Date() });
});

describe('sendMessage — context-anchored bypass', () => {
    it('allows sending in a context-anchored conversation between non-connected users', async () => {
        // Anchored conversation (has requirementId)
        mockConversationFindById.mockResolvedValue(makeConversation(true));
        // No accepted connection exists between the two users
        mockConnectionFindOne.mockResolvedValue(null);
        // Recipient allows messages from 'anyone' (or 'connections' — bypass makes it irrelevant)
        mockUserFindById.mockReturnValue(baseRecipientSettings('connections'));

        await expect(
            messagesService.sendMessage({ conversationId: 'conv1', senderId: SENDER, text: 'hello' })
        ).resolves.toMatchObject({ _id: 'msg1' });

        // Connection was never queried (the bypass skips it)
        expect(mockConnectionFindOne).not.toHaveBeenCalled();
    });

    it('rejects sending in a plain (no-context) conversation between non-connected users', async () => {
        // Plain DM — no context field
        mockConversationFindById.mockResolvedValue(makeConversation(false));
        // No accepted connection
        mockConnectionFindOne.mockResolvedValue(null);

        await expect(
            messagesService.sendMessage({ conversationId: 'conv1', senderId: SENDER, text: 'hello' })
        ).rejects.toThrow('Cannot send message. Connection is not active.');

        expect(mockConnectionFindOne).toHaveBeenCalled();
    });

    it('allows sending in an invite-anchored conversation (no requirementId) between non-connected users', async () => {
        // Invite-anchored conversation (has inviteId, no requirementId)
        mockConversationFindById.mockResolvedValue(makeInviteConversation());
        // No accepted connection exists
        mockConnectionFindOne.mockResolvedValue(null);
        mockUserFindById.mockReturnValue(baseRecipientSettings('connections'));

        await expect(
            messagesService.sendMessage({ conversationId: 'conv2', senderId: SENDER, text: 'hello' })
        ).resolves.toMatchObject({ _id: 'msg1' });

        // Connection was never queried (the bypass skips it)
        expect(mockConnectionFindOne).not.toHaveBeenCalled();
    });

    it('still rejects even in anchored conversation when recipient preference is "none"', async () => {
        // Anchored — bypass the connection check
        mockConversationFindById.mockResolvedValue(makeConversation(true));
        mockConnectionFindOne.mockResolvedValue(null);
        // Recipient has hard-blocked messages
        mockUserFindById.mockReturnValue(baseRecipientSettings('none'));

        await expect(
            messagesService.sendMessage({ conversationId: 'conv1', senderId: SENDER, text: 'hello' })
        ).rejects.toThrow('MESSAGING_BLOCKED');
    });
});
