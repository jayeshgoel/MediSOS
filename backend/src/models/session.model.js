// backend/src/models/session.model.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const SessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  deviceId: { type: String },
  tokenId: { type: String, required: true, index: true },
  refreshTokenHash: { type: String, required: true },
  issuedAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
  revokedAt: { type: Date },
  ip: { type: String },
  ua: { type: String },
}, { timestamps: true });

SessionSchema.index({ tokenId: 1 });

module.exports = mongoose.model('Session', SessionSchema);
