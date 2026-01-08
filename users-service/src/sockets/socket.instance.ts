import { Server } from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData } from './socket.types';

let io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export const setIO = (instance: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>) => {
    io = instance;
};

export const getIO = () => {
    if (!io) {
        throw new Error('Socket.io not initialized!');
    }
    return io;
};
