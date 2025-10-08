// src/config/db.js
const mongoose = require('mongoose');

async function connectMongo(uri) {
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log('MongoDB connected');
}

module.exports = connectMongo;
