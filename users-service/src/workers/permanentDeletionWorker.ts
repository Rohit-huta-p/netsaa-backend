// src/workers/permanentDeletionWorker.ts
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User';
import Artist from '../models/Artist';
import Organizer from '../models/Organizer';
import Connection from '../connections/connections.model';
import Notification from '../notifications/notification.model';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand, ObjectIdentifier } from '@aws-sdk/client-s3';

dotenv.config();

const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
    }
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || 'netsa-media';

/**
 * Helper to delete all objects under a given prefix using AWS S3 batch deletion.
 * Idempotent: safe to run multiple times, even if empty.
 */
const deleteS3Prefix = async (prefix: string) => {
    try {
        let isTruncated = true;
        let continuationToken: string | undefined = undefined;

        while (isTruncated) {
            // 1. List objects under the prefix
            const listCommand = new ListObjectsV2Command({
                Bucket: BUCKET_NAME,
                Prefix: prefix,
                ContinuationToken: continuationToken,
            });

            const listResponse: any = await s3Client.send(listCommand);

            if (!listResponse.Contents || listResponse.Contents.length === 0) {
                break; // No content found
            }

            // 2. Prepare batch delete payload (max 1000 per request)
            const objectsToDelete: ObjectIdentifier[] = listResponse.Contents.map((obj: any) => ({ Key: obj.Key }));

            const deleteCommand = new DeleteObjectsCommand({
                Bucket: BUCKET_NAME,
                Delete: {
                    Objects: objectsToDelete,
                    Quiet: true
                }
            });

            // 3. Delete batch
            await s3Client.send(deleteCommand);
            console.log(`[Worker] Deleted ${objectsToDelete.length} objects under prefix: ${prefix}`);

            isTruncated = listResponse.IsTruncated ?? false;
            continuationToken = listResponse.NextContinuationToken;
        }
    } catch (err) {
        console.error(`[Worker] Failed to delete S3 prefix ${prefix}:`, err);
        // Do not throw — ensure worker continues and is idempotent.
    }
};

dotenv.config();

const runWorker = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/netsa');
        console.log('[Worker] Connected to MongoDB');

        const usersToDelete = await User.find({
            accountStatus: 'scheduled_for_deletion',
            deletionScheduledAt: { $lt: new Date() },
        });

        console.log(`[Worker] Found ${usersToDelete.length} users scheduled for permanent deletion.`);

        for (const user of usersToDelete) {
            console.log(`[Worker] Processing permanent deletion for user: ${user._id}`);
            try {
                // Tombstone email
                user.originalEmail = user.email;
                user.email = `deleted_${user._id}_${Date.now()}@deleted.netsa`;

                // Scrub PII fields from User document
                user.displayName = 'Deleted User';
                user.profileImageUrl = undefined;
                user.bio = undefined;
                user.phoneNumber = undefined;
                user.location = undefined;
                user.skills = [];
                user.experience = [];
                user.artistType = [];
                user.instagramHandle = undefined;
                user.youtubeUrl = undefined;
                user.spotifyUrl = undefined;
                user.soundcloudUrl = undefined;
                user.age = undefined;
                user.gender = undefined;
                user.height = undefined;
                user.skinTone = undefined;
                user.galleryUrls = [];
                user.videoUrls = [];
                user.hasPhotos = false;
                user.devices = [];
                user.cached = undefined;
                user.settings = undefined;

                // Hard delete related entities
                await Artist.deleteOne({ userId: user._id });
                await Organizer.deleteOne({ userId: user._id });
                await Connection.deleteMany({
                    $or: [{ requesterId: user._id }, { recipientId: user._id }],
                });
                await Notification.deleteMany({
                    $or: [{ userId: user._id }, { actorId: user._id }],
                });

                // Delete S3 media (users/userId, artists/userId, organizers/userId)
                const userIdStr = user._id.toString();
                await Promise.all([
                    deleteS3Prefix(`users/${userIdStr}/`),
                    deleteS3Prefix(`artists/${userIdStr}/`),
                    deleteS3Prefix(`organizers/${userIdStr}/`)
                ]);

                // Nullify authentication and finalize status
                user.passwordHash = undefined;
                user.accountStatus = 'permanently_deleted';
                user.mediaPurged = true;


                await user.save();
                console.log(`[Worker] Successfully deleted user: ${user._id}`);
            } catch (err) {
                console.error(`[Worker] Failed to process user ${user._id}:`, err);
            }
        }

        console.log('[Worker] Finished processing.');
        process.exit(0);
    } catch (error) {
        console.error('[Worker] Fatal error:', error);
        process.exit(1);
    }
};

runWorker();
