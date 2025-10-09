// backend/src/controllers/auth.controller.js
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const User = require('../models/user.model');
const Session = require('../models/session.model');
const nacService = require('../services/nac.service');
const { signAccessToken } = require('../utils/jwt.util');

const SALT_ROUNDS = 10;

function genState() {
  return crypto.randomBytes(16).toString('hex');
}

// create composed refresh token (tokenId.rawToken)
function createRefreshTokenPayload() {
  const tokenId = crypto.randomBytes(8).toString('hex');
  const rawToken = crypto.randomBytes(48).toString('hex');
  const refreshToken = `${tokenId}.${rawToken}`;
  return { refreshToken, tokenId, rawToken };
}

/**
 * POST /api/auth/onboard/init
 * - Create or find user
 * - Generate state and authorizationUrl for device to open
 * - Store state in user.nacVerification.requestId for correlation
 */
async function onboardInit(req, res) {
  try {
    const { phone, fullName } = req.body;
    if (!phone) return res.status(400).json({ error: 'phone required' });

    let user = await User.findOne({ phone });
    if (!user) {
      user = new User({ phone, fullName: fullName || 'Unknown' });
    }

    const state = genState();
    const authorizationUrl = await nacService.buildAuthorizationUrl({ phone, state });

    user.nacVerification.requestId = state;
    user.nacVerification.checkUrl = authorizationUrl;
    user.nacVerification.status = 'pending';
    user.nacVerification.attempts = (user.nacVerification.attempts || 0) + 1;
    user.nacVerification.requestedPhone = phone;
    await user.save();

    return res.json({
      authorizationUrl,
      message: 'Open this URL on the user device using mobile data (disable Wi-Fi/VPN).'
    });
  } catch (err) {
    console.error('onboardInit error', err);
    return res.status(500).json({ error: 'internal_error' });
  }
}

/**
 * GET /api/auth/onboard/callback
 * - Called by NaC redirect with ?code=...&state=...
 * - Exchange code -> token, call verify endpoint, update user
 */
async function onboardCallback(req, res) {
  try {
    const { code, state } = req.query;
    if (!code || !state) return res.status(400).send('missing code or state');

    const user = await User.findOne({ 'nacVerification.requestId': state });
    if (!user) {
      console.warn('onboardCallback: user not found for state', state);
      return res.status(404).send('user not found for state');
    }

    const tokenResp = await nacService.exchangeCodeForToken({ code });
    const accessToken = tokenResp && (tokenResp.access_token || tokenResp.accessToken);
    if (!accessToken) {
      user.nacVerification.status = 'failed';
      user.nacVerification.rawResponse = tokenResp;
      await user.save();
      return res.status(500).send('token_exchange_failed');
    }

    // Perform number verification with the access token
    const phoneToVerify = user.nacVerification.requestedPhone || user.phone;
    const verifyResp = await nacService.verifyPhoneNumber({ accessToken, phoneNumber: phoneToVerify });

    // Map various possible success shapes to boolean
    let verified = false;
    if (typeof verifyResp === 'boolean') verified = verifyResp === true;
    else if (verifyResp && (verifyResp === true || verifyResp.result === true || verifyResp.value === true)) verified = true;
    else if (verifyResp && verifyResp.success === true) verified = true;

    user.nacVerification.rawResponse = verifyResp;
    user.nacVerification.verifiedAt = verified ? new Date() : undefined;
    user.nacVerification.status = verified ? 'verified' : 'failed';
    if (verified) user.nacVerification.requestId = null; // clear state to avoid replay
    await user.save();

    if (verified) {
      return res.send('<html><body><h3>Phone verification successful.</h3><p>You can close this page and return to the app.</p></body></html>');
    } else {
      return res.send('<html><body><h3>Phone verification failed.</h3><p>Please retry verification from the app.</p></body></html>');
    }
  } catch (err) {
    console.error('onboardCallback error', err);
    return res.status(500).send('internal_error');
  }
}

/**
 * POST /api/auth/onboard/webhook
 * - Optional: simulate or accept NaC webhook payloads (secure in prod)
 */
async function onboardWebhook(req, res) {
  try {
    const payload = req.body;
    // TODO: validate signature header (if NaC sends one) in prod

    const requestState = payload.state || payload.requestId || payload.nonce;
    const status = payload.status || payload.verificationStatus || (payload.result === true ? 'verified' : 'failed');

    if (!requestState) {
      console.warn('onboardWebhook: no request/state in payload');
      return res.status(400).json({ error: 'missing_request_state' });
    }

    const user = await User.findOne({ 'nacVerification.requestId': requestState });
    if (!user) {
      console.warn('onboardWebhook: user not found for requestState', requestState);
      return res.status(404).json({ ok: false });
    }

    user.nacVerification.status = status === 'verified' ? 'verified' : 'failed';
    if (status === 'verified') {
      user.nacVerification.verifiedAt = new Date();
      user.nacVerification.requestId = null;
    }
    user.nacVerification.rawResponse = payload;
    await user.save();

    return res.json({ ok: true });
  } catch (err) {
    console.error('onboardWebhook error', err);
    return res.status(500).json({ error: 'internal_error' });
  }
}

/**
 * POST /api/auth/login
 * - Issues access + refresh token if user is verified
 */
async function login(req, res) {
  try {
    const { phone, deviceId, deviceInfo } = req.body;
    if (!phone) return res.status(400).json({ error: 'phone required' });

    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ error: 'user_not_found' });

    if (user.nacVerification.status !== 'verified') {
      return res.status(401).json({ error: 'phone_not_verified' });
    }

    const accessToken = signAccessToken(user);

    const { refreshToken, tokenId, rawToken } = createRefreshTokenPayload();
    const refreshHash = await bcrypt.hash(rawToken, SALT_ROUNDS);

    const session = new Session({
      userId: user._id,
      deviceId: deviceId || null,
      tokenId,
      refreshTokenHash: refreshHash,
      ip: req.ip,
      ua: req.get('User-Agent') || '',
    });
    await session.save();

    if (deviceId) {
      const found = user.devices.find(d => d.deviceId === deviceId);
      if (!found) {
        user.devices.push({ deviceId, platform: deviceInfo?.platform || 'android', lastSeenAt: new Date() });
      } else {
        found.lastSeenAt = new Date();
      }
    }
    user.lastLoginAt = new Date();
    await user.save();

    return res.json({
      accessToken,
      refreshToken, // tokenId.rawToken
      expiresIn: parseInt(process.env.JWT_ACCESS_TTL_SECONDS || '900', 10),
      user: user.toPublicJSON()
    });
  } catch (err) {
    console.error('login error', err);
    return res.status(500).json({ error: 'internal_error' });
  }
}

/**
 * POST /api/auth/refresh
 */
async function refreshToken(req, res) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });

    const [tokenId, rawToken] = (refreshToken || '').split('.');
    if (!tokenId || !rawToken) return res.status(400).json({ error: 'invalid_refresh_format' });

    const session = await Session.findOne({ tokenId, revokedAt: { $exists: false } });
    if (!session) return res.status(401).json({ error: 'invalid_refresh' });

    const match = await bcrypt.compare(rawToken, session.refreshTokenHash);
    if (!match) {
      session.revokedAt = new Date();
      await session.save();
      return res.status(401).json({ error: 'invalid_refresh' });
    }

    const user = await User.findById(session.userId);
    if (!user) return res.status(404).json({ error: 'user_not_found' });

    const accessToken = signAccessToken(user);

    // rotate refresh token
    const { refreshToken: newRefreshToken, tokenId: newTokenId, rawToken: newRawToken } = createRefreshTokenPayload();
    const newHash = await bcrypt.hash(newRawToken, SALT_ROUNDS);

    session.tokenId = newTokenId;
    session.refreshTokenHash = newHash;
    session.lastSeenAt = new Date();
    await session.save();

    return res.json({
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: parseInt(process.env.JWT_ACCESS_TTL_SECONDS || '900', 10)
    });
  } catch (err) {
    console.error('refreshToken error', err);
    return res.status(500).json({ error: 'internal_error' });
  }
}

/**
 * POST /api/auth/logout
 */
async function logout(req, res) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });

    const [tokenId] = refreshToken.split('.');
    if (!tokenId) return res.status(400).json({ error: 'invalid_refresh_format' });

    const session = await Session.findOne({ tokenId });
    if (!session) return res.status(200).json({ ok: true });

    session.revokedAt = new Date();
    await session.save();
    return res.json({ ok: true });
  } catch (err) {
    console.error('logout error', err);
    return res.status(500).json({ error: 'internal_error' });
  }
}

module.exports = {
  onboardInit,
  onboardCallback,
  onboardWebhook,
  login,
  refreshToken,
  logout,
};
