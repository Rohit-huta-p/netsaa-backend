import mongoose from 'mongoose';
import User from './models/User';
import Artist from './models/Artist';
import Organizer from './models/Organizer';
import dotenv from 'dotenv';

dotenv.config();

// Use a local DB for testing or fall back to a mock if no URI
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/netsa_test_models';

async function run() {
    console.log('Connecting to MongoDB...');
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected.');
    } catch (err) {
        console.error('Connection error:', err);
        process.exit(1);
    }

    // Cleanup
    await User.deleteMany({});
    await Artist.deleteMany({});
    await Organizer.deleteMany({});

    console.log('Creating User (Artist)...');
    const userArtist = await User.create({
        email: 'artist@example.com',
        authProvider: 'email',
        role: 'artist',
        displayName: 'Test Artist'
    });
    console.log('User created:', userArtist.id);

    console.log('Creating Artist profile...');
    const artist = await Artist.create({
        userId: userArtist.id,
        firstName: 'John',
        lastName: 'Doe',
        artistType: 'Musician',
        specialities: ['Guitar', 'Vocals']
    });
    console.log('Artist created:', artist.id);

    console.log('Creating User (Organizer)...');
    const userOrganizer = await User.create({
        email: 'organizer@example.com',
        authProvider: 'email',
        role: 'organizer',
        displayName: 'Test Organizer'
    });
    console.log('User created:', userOrganizer.id);

    console.log('Creating Organizer profile...');
    const organizer = await Organizer.create({
        userId: userOrganizer.id,
        organizationName: 'Great Events Co',
        organizationType: 'Agency'
    });
    console.log('Organizer created:', organizer.id);

    // Verification
    const fetchedArtist = await Artist.findOne({ userId: userArtist.id }).populate('userId');
    if (fetchedArtist && (fetchedArtist.userId as any).email === 'artist@example.com') {
        console.log('PASS: Artist linked correctly to User.');
    } else {
        console.error('FAIL: Artist link check failed.');
    }

    const fetchedOrganizer = await Organizer.findOne({ userId: userOrganizer.id }).populate('userId');
    if (fetchedOrganizer && (fetchedOrganizer.userId as any).email === 'organizer@example.com') {
        console.log('PASS: Organizer linked correctly to User.');
    } else {
        console.error('FAIL: Organizer link check failed.');
    }

    await mongoose.disconnect();
    console.log('Done.');
}

run();
