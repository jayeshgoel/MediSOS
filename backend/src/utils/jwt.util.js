// src/utils/jwt.util.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const ACCESS_TTL = parseInt(process.env.JWT_ACCESS_TTL_SECONDS || '900', 10); // seconds
const REFRESH_TTL_DAYS = parseInt(process.env.JWT_REFRESH_TTL_DAYS || '30', 10);

function signAccessToken(user) {
  const payload = {
    sub: user._id.toString(),
    phone: user.phone,
    roles: user.roles,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TTL + 's' });
}

function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function generateRefreshToken() {
  // strong random token stored hashed in DB
  return crypto.randomBytes(48).toString('hex');
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  ACCESS_TTL,
  REFRESH_TTL_DAYS,
};

