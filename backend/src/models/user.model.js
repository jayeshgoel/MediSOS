// src/models/user.model.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const DocumentMetaSchema = new Schema({
  filename: { type: String, required: true },
  url: { type: String, required: true },
  mimeType: { type: String },
  sizeBytes: { type: Number },
  uploadedAt: { type: Date, default: Date.now },
  uploadedFromDeviceId: { type: String },
  tags: { type: [String], default: [] },
}, { _id: false });

const EmergencyContactSchema = new Schema({
  name: { type: String, required: true },
  relation: { type: String },
  phone: { type: String, required: true },
}, { _id: false });

const DeviceSchema = new Schema({
  deviceId: { type: String, required: true },
  platform: { type: String, enum: ['android','ios','web'], default: 'android' },
  fcmToken: { type: String },
  lastSeenAt: { type: Date, default: Date.now },
}, { _id: false });

const NaCVerificationSchema = new Schema({
  requestId: { type: String },
  checkUrl: { type: String },
  status: { type: String, enum: ['pending','verified','failed','expired'], default: 'pending' },
  attempts: { type: Number, default: 0 },
  verificationMethod: { type: String },
  verifiedAt: { type: Date },
  rawResponse: { type: Schema.Types.Mixed },
}, { _id: false });

const ResponderEntrySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  alias: { type: String },
  isPrimary: { type: Boolean, default: false },
  addedAt: { type: Date, default: Date.now },
  consentGiven: { type: Boolean, default: null },
}, { _id: false });

const UserSchema = new Schema({
  fullName: { type: String, required: true, trim: true },
  phone: { type: String, required: true, unique: true, index: true },
  email: { type: String, index: true, sparse: true },
  passwordHash: { type: String },
  roles: { type: [String], default: ['user'] },
  isActive: { type: Boolean, default: true },
  nacVerification: { type: NaCVerificationSchema, default: () => ({}) },
  dob: { type: Date },
  gender: { type: String, enum: ['male','female','other','prefer_not_to_say'], default: 'prefer_not_to_say' },
  address: {
    line1: { type: String },
    line2: { type: String },
    city: { type: String },
    state: { type: String },
    postalCode: { type: String },
    country: { type: String, default: 'IN' },
  },
  documents: { type: [DocumentMetaSchema], default: [] },
  emergencyContacts: { type: [EmergencyContactSchema], default: [] },
  devices: { type: [DeviceSchema], default: [] },
  responders: { type: [ResponderEntrySchema], default: [] },
  preferences: {
    language: { type: String, default: 'en' },
    allowQoD: { type: Boolean, default: false },
    notificationEnabled: { type: Boolean, default: true },
  },
  hospitalId: { type: Schema.Types.ObjectId, ref: 'Hospital', index: true, sparse: true },
  hospitalRole: { type: String },
  status: { type: String, enum: ['active','suspended','deleted'], default: 'active' },
  lastLoginAt: { type: Date },
}, { timestamps: true });

UserSchema.methods.toPublicJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  if (obj.nacVerification && obj.nacVerification.rawResponse) delete obj.nacVerification.rawResponse;
  return obj;
};

module.exports = mongoose.model('User', UserSchema);
