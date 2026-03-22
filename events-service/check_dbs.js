const { MongoClient } = require('mongodb');

const uri = 'mongodb+srv://vcrohithutap:Abcd1234@netsa.8owokes.mongodb.net/';

async function listDbs() {
    const client = new MongoClient(uri);
    await client.connect();

    const adminDb = client.db().admin();
    const dbs = await adminDb.listDatabases();

    console.log("Databases in cluster:");
    dbs.databases.forEach(db => console.log(`- ${db.name}`));

    // Also list collections in 'test' database
    console.log("\\nCollections in 'test' DB:");
    const testCollections = await client.db('test').listCollections().toArray();
    testCollections.forEach(c => console.log(`- ${c.name}`));

    // Also list collections in 'netsa' or similar DB if it exists
    const customDbName = dbs.databases.find(db => db.name !== 'admin' && db.name !== 'local' && db.name !== 'test')?.name;
    if (customDbName) {
        console.log(`\\nCollections in '${customDbName}' DB:`);
        const customCollections = await client.db(customDbName).listCollections().toArray();
        customCollections.forEach(c => console.log(`- ${c.name}`));
    }

    await client.close();
}

listDbs().catch(console.error);
