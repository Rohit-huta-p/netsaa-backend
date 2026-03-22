const mongoose = require('mongoose');

const uri = 'mongodb+srv://vcrohithutap:Abcd1234@netsa.8owokes.mongodb.net/';

async function checkDb() {
    await mongoose.connect(uri);
    console.log('Connected to DB:', mongoose.connection.name);

    const users = mongoose.connection.db.collection('users');
    const registrations = mongoose.connection.db.collection('eventregistrations');

    const user = await users.findOne({ _id: new mongoose.Types.ObjectId('69a8831ac1e4da33b62382bf') });
    console.log('\\n--- User check ---');
    console.log(user ? `Found user: ${user.email}` : 'User NOT found');

    const reg = await registrations.findOne({ _id: new mongoose.Types.ObjectId('69ada132ff39a7b5479b295f') });
    console.log('\\n--- Registration check ---');
    console.log(reg ? `Found registration for event ${reg.eventId}` : 'Registration NOT found');

    mongoose.disconnect();
}

checkDb().catch(console.error);
