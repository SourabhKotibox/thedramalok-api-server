const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb+srv://kotiboxserver_db_user:pS4U8tbfpRGZcPRz@cluster0.7opughx.mongodb.net/streamvault');
  console.log("Connected to DB");
  
  const models = mongoose.models || {};
  // if not loaded, we can just do raw queries
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  
  let totalReplaced = 0;

  for (const col of collections) {
    const collection = db.collection(col.name);
    const docs = await collection.find({}).toArray();
    for (const doc of docs) {
      let changed = false;
      const newDoc = JSON.parse(JSON.stringify(doc), (key, value) => {
        if (typeof value === 'string' && value.toLowerCase().includes('kotibox')) {
          changed = true;
          // Case-preserving replacement is tricky, but let's just do regex
          let replaced = value.replace(/kotibox ott/gi, 'The Drama Lock');
          replaced = replaced.replace(/kotibox/gi, 'TheDramaLock');
          return replaced;
        }
        return value;
      });
      if (changed) {
        // Exclude _id from update
        const id = newDoc._id;
        delete newDoc._id;
        await collection.updateOne({ _id: doc._id }, { $set: newDoc });
        totalReplaced++;
        console.log(`Updated doc in ${col.name}`);
      }
    }
  }
  
  console.log("Total replaced:", totalReplaced);
  process.exit(0);
}
run();
