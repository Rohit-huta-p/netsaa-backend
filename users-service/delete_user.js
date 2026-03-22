const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env') });
const MONGO_URI = process.env.MONGO_URI || process.env.USERS_MONGO_URI || 'mongodb://localhost:27017/netsa';

const deleteUserAndRelatedData = async (userId) => {
    if (!userId) {
        console.error("Please provide a userId.");
        process.exit(1);
    }

    try {
        console.log(`Connecting to MongoDB at ${MONGO_URI}...`);
        await mongoose.connect(MONGO_URI);
        console.log("Connected to MongoDB.");

        const db = mongoose.connection.db;
        const userObjId = new mongoose.Types.ObjectId(userId);

        console.log(`\n--- Initiating deletion for User ID: ${userId} ---`);

        // 1. users-service
        console.log("\nDeleting from users-service collections...");
        await deleteFromCollection(db, 'users', { _id: userObjId });
        await deleteFromCollection(db, 'users', { authId: userId });

        await deleteFromCollection(db, 'artists', { userId: userObjId });
        await deleteFromCollection(db, 'organizers', { userId: userObjId });

        // Connections
        await deleteFromCollection(db, 'connections', { $or: [{ requester: userObjId }, { recipient: userObjId }] });

        // Conversations and Messages
        const conversations = await db.collection('conversations').find({ participants: userObjId }).toArray();
        const conversationIds = conversations.map(c => c._id);
        if (conversationIds.length > 0) {
            console.log(`Found ${conversationIds.length} conversations. Deleting their messages...`);
            const msgResult = await db.collection('messages').deleteMany({ conversationId: { $in: conversationIds } });
            console.log(`- Deleted ${msgResult.deletedCount} messages from those conversations.`);

            const convResult = await db.collection('conversations').deleteMany({ participants: userObjId });
            console.log(`- Deleted ${convResult.deletedCount} conversations.`);
        }

        // Stray messages
        await deleteFromCollection(db, 'messages', { senderId: userObjId });

        // Notifications
        await deleteFromCollection(db, 'notifications', { recipient: userObjId });
        await deleteFromCollection(db, 'notifications', { sender: userObjId });


        // 2. events-service
        console.log("\nDeleting from events-service collections...");
        await deleteFromCollection(db, 'events', { organizer: userObjId });
        await deleteFromCollection(db, 'eventcomments', { user: userObjId });
        await deleteFromCollection(db, 'eventregistrations', { user: userObjId });
        await deleteFromCollection(db, 'eventreservations', { user: userObjId });
        await deleteFromCollection(db, 'savedevents', { user: userObjId });


        // 3. gigs-service
        console.log("\nDeleting from gigs-service collections...");
        await deleteFromCollection(db, 'gigs', { organizer: userObjId });
        await deleteFromCollection(db, 'gigcomments', { user: userObjId });
        await deleteFromCollection(db, 'gigapplications', { artist: userObjId });
        await deleteFromCollection(db, 'savedgigs', { user: userObjId });


        // 4. support-service
        console.log("\nDeleting from support-service collections...");
        const tickets = await db.collection('supporttickets').find({ user: userObjId }).toArray();
        const ticketIds = tickets.map(t => t._id);
        if (ticketIds.length > 0) {
            console.log(`Found ${ticketIds.length} support tickets. Deleting their messages...`);
            const supportMsgResult = await db.collection('supportmessages').deleteMany({ ticket: { $in: ticketIds } });
            console.log(`- Deleted ${supportMsgResult.deletedCount} support messages from those tickets.`);

            await deleteFromCollection(db, 'supporttickets', { user: userObjId });
            await deleteFromCollection(db, 'supportescalations', { ticket: { $in: ticketIds } });
        }
        await deleteFromCollection(db, 'supportmessages', { sender: userObjId });

        console.log(`\n--- Deletion for User ID: ${userId} completed successfully ---`);

    } catch (error) {
        console.error("Error during deletion:", error);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB.");
    }
};

const deleteFromCollection = async (db, collectionName, query) => {
    try {
        const result = await db.collection(collectionName).deleteMany(query);
        console.log(`- Deleted ${result.deletedCount} documents from '${collectionName}'.`);
    } catch (err) {
        if (err.codeName !== 'NamespaceNotFound') {
            console.error(`- Error deleting from '${collectionName}':`, err.message);
        } else {
            console.log(`- Collection '${collectionName}' not found or empty.`);
        }
    }
}

const userIdArg = process.argv[2];
if (userIdArg) {
    deleteUserAndRelatedData(userIdArg);
} else {
    console.log("No ID passed as argument. Using hardcoded ID: 6938977882c578642eb40ebc");
    deleteUserAndRelatedData('6938977882c578642eb40ebc');
}
