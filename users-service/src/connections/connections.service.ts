import mongoose from 'mongoose';
import Connection from './connections.model';
import Conversation from './conversations.model';
import { notificationEvents, Notification, ConnectionSubtype } from '../notifications';
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

            // A previously DECLINED request must be re-sendable. reject() leaves the
            // row in place as status:'rejected', and the {requesterId, recipientId}
            // unique index means we can't just create a second doc — so revive THIS
            // row into a fresh pending request (in whichever direction it's now being
            // sent) and emit a new notification so the recipient actually sees it.
            // Without this, a declined pair is permanently stuck: every re-send 409s
            // and the recipient is never notified.
            if (existingConnection.status === 'rejected') {
                existingConnection.requesterId = requesterId as any;
                existingConnection.recipientId = recipientId as any;
                existingConnection.status = 'pending';
                existingConnection.message = message; // undefined clears any stale declined note
                await existingConnection.save();

                // A re-send supersedes the old request: drop any prior request
                // notification for this connection (the declined one, or a stale
                // pending) so the recipient sees ONE fresh row, not a growing stack.
                await Notification.deleteMany({
                    subtype: ConnectionSubtype.REQUEST,
                    'data.params.connectionId': existingConnection._id.toString(),
                });

                notificationEvents.emitConnectionRequested({
                    recipientId,
                    actorId: requesterId,
                    connectionId: existingConnection._id.toString(),
                    message,
                });

                return existingConnection;
            }

            // pending → a live request already exists; accepted → already connected.
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

    /**
     * Stamp the recipient's original "connection request" notification with its
     * final outcome ('accepted' | 'rejected'). The notification card reads this
     * off the row it already fetched, so the Accept/Decline CTAs clear on every
     * surface — and after an app reload — with no extra lookup. Best-effort: a
     * failure here must never block the accept/reject itself.
     */
    private async stampRequestNotification(
        recipientId: mongoose.Types.ObjectId | string,
        connectionId: string,
        outcome: 'accepted' | 'rejected'
    ) {
        try {
            await Notification.updateMany(
                {
                    userId: recipientId,
                    subtype: ConnectionSubtype.REQUEST,
                    'data.params.connectionId': connectionId,
                },
                { $set: { 'data.params.status': outcome } }
            );
        } catch (err) {
            console.warn('[ConnectionsService] failed to stamp request notification', err);
        }
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
                await this.stampRequestNotification(connection.recipientId, connectionId, 'accepted');
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

            // Resolve the recipient's original request row so its CTAs clear.
            await this.stampRequestNotification(connection.recipientId, connectionId, 'accepted');

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
            await this.stampRequestNotification(connection.recipientId, connectionId, 'rejected');
            return connection;
        }

        // A request that's moved on (accepted / blocked) can't be rejected.
        if (connection.status !== 'pending') {
            throw new ConnectionError(`Connection request is already ${connection.status}.`, 409);
        }

        connection.status = 'rejected';
        await connection.save();

        // Resolve the recipient's original request row so its CTAs clear.
        await this.stampRequestNotification(connection.recipientId, connectionId, 'rejected');

        return connection;
    }

    /**
     * The requester cancels their own still-pending outgoing request. Deletes the
     * row entirely (so the pair is immediately re-sendable — no lingering doc to
     * trip the {requesterId, recipientId} unique index) and clears the recipient's
     * pending request notification. Only the requester may withdraw, and only while
     * the request hasn't been accepted/blocked.
     */
    async withdrawRequest(connectionId: string, currentUserId: string) {
        const connection = await Connection.findById(connectionId);

        if (!connection) {
            throw new ConnectionError('Connection request not found.', 404);
        }

        if (connection.requesterId.toString() !== currentUserId) {
            throw new ConnectionError('You are not authorized to withdraw this request.', 403);
        }

        // Already connected → nothing to withdraw (remove the connection instead).
        if (connection.status === 'accepted') {
            throw new ConnectionError('You are already connected.', 409);
        }
        if (connection.status === 'blocked') {
            throw new ConnectionError('This request can no longer be withdrawn.', 409);
        }

        // pending (normal) or rejected (defensive) → remove the row so a fresh
        // request can be sent later with no leftover state.
        await Connection.findByIdAndDelete(connectionId);

        // Best-effort: drop the recipient's pending "connection request" notification
        // so it doesn't linger as an actionable card for a request that's gone.
        try {
            await Notification.deleteMany({
                subtype: ConnectionSubtype.REQUEST,
                'data.params.connectionId': connectionId,
            });
        } catch (err) {
            console.warn('[ConnectionsService] failed to clear request notification on withdraw', err);
        }

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
