import { IUser } from '../models/User';

export const SOCKET_EVENTS = {
    CONVERSATION: {
        JOIN: 'conversation:join',
        LEAVE: 'conversation:leave',
    },
    MESSAGE: {
        NEW: 'message:new',
        SEEN: 'message:seen',
    },
    PRESENCE: {
        ONLINE: 'user:online',
        OFFLINE: 'user:offline',
        CHECK: 'presence:check',
        ONLINE_LIST: 'presence:online-list',
    },
    TYPING: {
        START: 'typing:start',
        STOP: 'typing:stop',
    },
    DISCUSSION: {
        JOIN: 'discussion:join',
        NEW: 'discussion:new',
    },
    ERROR: 'error'
} as const;

export interface ServerToClientEvents {
    [SOCKET_EVENTS.MESSAGE.NEW]: (message: any) => void;
    [SOCKET_EVENTS.MESSAGE.SEEN]: (payload: { conversationId: string, userId: string, seenAt: Date }) => void;
    [SOCKET_EVENTS.TYPING.START]: (conversationId: string, userId: string) => void;
    [SOCKET_EVENTS.TYPING.STOP]: (conversationId: string, userId: string) => void;
    [SOCKET_EVENTS.PRESENCE.CHECK]: (payload: { userIds: string[] }) => void;
    [SOCKET_EVENTS.PRESENCE.ONLINE]: (payload: { userId: string }) => void;
    [SOCKET_EVENTS.PRESENCE.OFFLINE]: (payload: { userId: string }) => void;
    [SOCKET_EVENTS.PRESENCE.ONLINE_LIST]: (payload: { onlineUserIds: string[] }) => void;
    [SOCKET_EVENTS.ERROR]: (error: { message: string }) => void;
}

export interface ClientToServerEvents {
    [SOCKET_EVENTS.CONVERSATION.JOIN]: (conversationId: string) => void;
    [SOCKET_EVENTS.CONVERSATION.LEAVE]: (conversationId: string) => void;
    [SOCKET_EVENTS.TYPING.START]: (conversationId: string) => void;
    [SOCKET_EVENTS.TYPING.STOP]: (conversationId: string) => void;
}

export interface InterServerEvents {
    ping: () => void;
}

export interface SocketData {
    user: IUser;
}
