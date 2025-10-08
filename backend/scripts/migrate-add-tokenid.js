// backend/scripts/migrate-add-tokenid.js
require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/medisos';
const Session = require('../src/models/session.model');

async function main() {
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to MongoDB for migration.');

  // Find sessions missing tokenId
  const cursor = Session.find({ $or: [{ tokenId: { $exists: false } }, { tokenId: null }] }).cursor();
  let count = 0;
  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    // generate a tokenId if missing
    const tokenId = require('crypto').randomBytes(8).toString('hex');
    // set tokenId, keep refreshTokenHash as-is
    doc.tokenId = tokenId;
    await doc.save();
    count++;
  }

  console.log(`Migration complete. Updated ${count} session(s).`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('Migration failed', err);
  process.exit(1);
});
