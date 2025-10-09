// backend/src/services/nac.service.js
// Implements the "Using the API" flow from NaC docs.
// - optionally fetch client credentials via RapidAPI endpoint
// - discover OpenID endpoints
// - build authorization URL
// - exchange code -> token
// - call passthrough verify endpoint

const axios = require('axios');
const querystring = require('querystring');

const RAPID_BASE = process.env.NAC_RAPIDAPI_BASE; // e.g. https://network-as-code.p-eu.rapidapi.com
const RAPID_HOST = process.env.NAC_RAPIDAPI_HOST; // e.g. network-as-code.nokia.rapidapi.com
const RAPID_KEY = process.env.NAC_RAPIDAPI_KEY || ''; // if your org uses RapidAPI fronting
let CLIENT_ID = process.env.NAC_CLIENT_ID || '';
let CLIENT_SECRET = process.env.NAC_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.NAC_REDIRECT_URI;
const SCOPE = process.env.NAC_SCOPE || 'dpv:FraudPreventionAndDetection number-verification:verify';

if (!RAPID_BASE) console.warn('NAC service: NAC_RAPIDAPI_BASE not set');
if (!REDIRECT_URI) console.warn('NAC service: NAC_REDIRECT_URI not set');

/**
 * getClientCredentials
 * - If CLIENT_ID/CLIENT_SECRET are NOT configured in env, attempt to obtain them
 *   from the NaC RapidAPI client credentials endpoint (as documented).
 * - After getting credentials, set in-memory variables (do NOT persist locally).
 */
async function getClientCredentialsFromApi() {
  if (!RAPID_BASE || !RAPID_KEY || CLIENT_ID) {
    return { client_id: CLIENT_ID, client_secret: CLIENT_SECRET };
  }

  const url = `${RAPID_BASE}/oauth2/v1/auth/clientcredentials`;
  const headers = {
    'X-RapidAPI-Host': RAPID_HOST,
    'X-RapidAPI-Key': RAPID_KEY,
  };

  const resp = await axios.get(url, { headers });
  if (resp && resp.data && resp.data.client_id && resp.data.client_secret) {
    CLIENT_ID = resp.data.client_id;
    CLIENT_SECRET = resp.data.client_secret;
    return { client_id: CLIENT_ID, client_secret: CLIENT_SECRET };
  }
  throw new Error('Failed to obtain client credentials from NaC API');
}

/**
 * Discover OpenID configuration (.well-known/openid-configuration)
 */
async function getOpenIdConfig() {
  const url = `${RAPID_BASE}/.well-known/openid-configuration`;
  const headers = {};
  if (RAPID_KEY) {
    headers['X-RapidAPI-Host'] = RAPID_HOST;
    headers['X-RapidAPI-Key'] = RAPID_KEY;
  }
  const resp = await axios.get(url, { headers });
  return resp.data;
}

/**
 * buildAuthorizationUrl({ phone, state })
 * - phone -> login_hint
 * - state -> correlation to identify user on callback
 */
async function buildAuthorizationUrl({ phone, state }) {
  // Ensure client_id present (either env or fetch programmatically)
  if (!CLIENT_ID) await getClientCredentialsFromApi();

  const oidc = await getOpenIdConfig();
  const authEndpoint = oidc.authorization_endpoint;
  const params = {
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    login_hint: phone,
    state,
  };
  return `${authEndpoint}?${querystring.stringify(params)}`;
}

/**
 * exchangeCodeForToken({ code })
 * - Exchanges authorization code for an access token (one-time use per device).
 */
async function exchangeCodeForToken({ code }) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    // Try to fetch them if not present
    await getClientCredentialsFromApi();
  }

  const oidc = await getOpenIdConfig();
  const tokenEndpoint = oidc.token_endpoint;

  const data = querystring.stringify({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    redirect_uri: REDIRECT_URI,
  });

  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (RAPID_KEY) {
    headers['X-RapidAPI-Host'] = RAPID_HOST;
    headers['X-RapidAPI-Key'] = RAPID_KEY;
  }

  const resp = await axios.post(tokenEndpoint, data, { headers });
  // resp.data expected to include access_token
  return resp.data;
}

/**
 * verifyPhoneNumber({ accessToken, phoneNumber })
 * - Calls the NaC passthrough Number Verification endpoint as documented.
 * - Returns the raw response (docs say it may be boolean or structured).
 */
async function verifyPhoneNumber({ accessToken, phoneNumber }) {
  const url = `${RAPID_BASE}/passthrough/camara/v1/number-verification/number-verification/v0/verify`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
  if (RAPID_KEY) {
    headers['X-RapidAPI-Host'] = RAPID_HOST;
    headers['X-RapidAPI-Key'] = RAPID_KEY;
  }

  const resp = await axios.post(url, { phoneNumber }, { headers });
  return resp.data;
}

/**
 * getDevicePhoneNumber({ accessToken })
 * - optional helper for retrieving device-attested phone number from access code
 */
async function getDevicePhoneNumber({ accessToken }) {
  const url = `${RAPID_BASE}/passthrough/camara/v1/number-verification/number-verification/v0/device-phone-number`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
  };
  if (RAPID_KEY) {
    headers['X-RapidAPI-Host'] = RAPID_HOST;
    headers['X-RapidAPI-Key'] = RAPID_KEY;
  }
  const resp = await axios.get(url, { headers });
  return resp.data;
}

module.exports = {
  getClientCredentialsFromApi,
  getOpenIdConfig,
  buildAuthorizationUrl,
  exchangeCodeForToken,
  verifyPhoneNumber,
  getDevicePhoneNumber,
};
