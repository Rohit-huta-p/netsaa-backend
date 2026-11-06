import mongoose from 'mongoose';
import Connection from './connections.model';
import Conversation from './conversations.model';
import { notificationEvents } from '../notifications';
import { ConnectionError } from './connections.errors';

class ConnectionsService {
    async sendRequest(requesterId: string, recipientId: string, message?: string) {
        if (requesterId === recipientId) {
            throw new ConnectionError('Cannot send connection request to self.', 400);
        }

        const existingConnection = await Connection.findOne({
            $or: [
                { requesterId, recipientId },
                { requesterId: recipientId, recipientId: requesterId },
            ],
        });

        if (existingConnection) {
            if (existingConnection.status === 'blocked') {
                throw new ConnectionError('Unable to send request. You are blocked.', 403); // Generic message for privacy/safety
            }
            throw new ConnectionError('Connection request already exists or you are already connected.', 409);
        }

        const newConnection = await Connection.create({
            requesterId,
            recipientId,
            status: 'pending',
            message,
        });

        // Emit event for notification system (fire-and-forget)
        notificationEvents.emitConnectionRequested({
            recipientId,
            actorId: requesterId,
            connectionId: newConnection._id.toString(),
            message,
        });

        return newConnection;
    }

    async acceptRequest(connectionId: string, currentUserId: string) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const connection = await Connection.findById(connectionId).session(session);

            if (!connection) {
                throw new ConnectionError('Connection request not found.', 404);
            }

            if (connection.recipientId.toString() !== currentUserId) {
                throw new ConnectionError('You are not authorized to accept this request.', 403);
            }

            // Idempotent: already accepted → return the existing connection and its
            // conversation without re-transitioning or re-notifying, so a stale
            // client that retries accept just succeeds.
            if (connection.status === 'accepted') {
                const existing = await Conversation.findOne({
                    participants: { $all: [connection.requesterId, connection.recipientId] },
                }).session(session);
                await session.commitTransaction();
                return { connection, conversation: existing };
            }

            // Anything else non-pending (rejected / blocked) can't be accepted.
            if (connection.status !== 'pending') {
                throw new ConnectionError(`Connection request is already ${connection.status}.`, 409);
            }

            connection.status = 'accepted';
            await connection.save({ session });

            // Create a conversation atomically
            // Check if conversation already exists to prevent duplicates
            let conversation = await Conversation.findOne({
                participants: { $all: [connection.requesterId, connection.recipientId] },
            }).session(session);

            if (!conversation) {
                const newConversation = await Conversation.create(
                    [
                        {
                            participants: [connection.requesterId, connection.recipientId],
                        },
                    ],
                    { session }
                );
                conversation = newConversation[0];
            }

            await session.commitTransaction();

            // Emit event for notification system (fire-and-forget)
            // Notify the original requester that their request was accepted
            notificationEvents.emitConnectionAccepted({
                recipientId: connection.requesterId.toString(),
                actorId: connection.recipientId.toString(),
                connectionId: connection._id.toString(),
                conversationId: conversation._id.toString(),
            });

            return { connection, conversation };
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }

    async rejectRequest(connectionId: string, currentUserId: string) {
        const connection = await Connection.findById(connectionId);

        if (!connection) {
            throw new ConnectionError('Connection request not found.', 404);
        }

        if (connection.recipientId.toString() !== currentUserId) {
            throw new ConnectionError('You are not authorized to reject this request.', 403);
        }

        // Idempotent: already rejected → return as-is so a stale client retry succeeds.
        if (connection.status === 'rejected') {
            return connection;
        }

        // A request that's moved on (accepted / blocked) can't be rejected.
        if (connection.status !== 'pending') {
            throw new ConnectionError(`Connection request is already ${connection.status}.`, 409);
        }

        connection.status = 'rejected';
        await connection.save();

        return connection;
    }

    async blockUser(connectionId: string, currentUserId: string) {
        const connection = await Connection.findById(connectionId);

        if (!connection) {
            throw new ConnectionError('Connection not found.', 404);
        }

        const isParticipant =
            connection.recipientId.toString() === currentUserId ||
            connection.requesterId.toString() === currentUserId;

        if (!isParticipant) {
            throw new ConnectionError('You are not authorized to block this connection.', 403);
        }

        connection.status = 'blocked';
        await connection.save();

        return connection;
    }

    async removeConnection(connectionId: string, currentUserId: string) {
        const connection = await Connection.findById(connectionId);

        if (!connection) {
            throw new ConnectionError('Connection not found.', 404);
        }

        const isParticipant =
            connection.recipientId.toString() === currentUserId ||
            connection.requesterId.toString() === currentUserId;

        if (!isParticipant) {
            throw new ConnectionError('You are not authorized to remove this connection.', 403);
        }

        await Connection.findByIdAndDelete(connectionId);

        return connection;
    }

    async listAcceptedConnections(userId: string) {
        const connections = await Connection.find({
            status: 'accepted',
            $or: [{ requesterId: userId }, { recipientId: userId }],
        })
            .populate('requesterId', 'displayName email profileImageUrl role')
            .populate('recipientId', 'displayName email profileImageUrl role');
        console.log("Connections:", connections);
        return connections;
    }

    async listPendingRequests(userId: string) {
        const requests = await Connection.find({
            recipientId: userId,
            status: 'pending',
        })
            .populate('requesterId', 'displayName email profileImageUrl role')
            .populate('recipientId', 'displayName email profileImageUrl role');

        return requests;
    }

    async listSentRequests(userId: string) {
        const requests = await Connection.find({
            requesterId: userId,
            status: 'pending',
        }).populate('recipientId', 'displayName email profileImageUrl role');

        return requests;
    }
}

export default new ConnectionsService();
