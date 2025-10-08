// backend/src/services/nac.service.js
// Final NaC service aligned to Network-as-Code Number Verification docs

const axios = require('axios');
const querystring = require('querystring');

const RAPID_BASE = process.env.NAC_RAPIDAPI_BASE; // e.g. https://network-as-code.p-eu.rapidapi.com
const RAPID_HOST = process.env.NAC_RAPIDAPI_HOST; // e.g. network-as-code.nokia.rapidapi.com
const RAPID_KEY = process.env.NAC_RAPIDAPI_KEY || ''; // optional
const CLIENT_ID = process.env.NAC_CLIENT_ID;
const CLIENT_SECRET = process.env.NAC_CLIENT_SECRET;
const REDIRECT_URI = process.env.NAC_REDIRECT_URI;
const SCOPE = process.env.NAC_SCOPE || 'dpv:FraudPreventionAndDetection number-verification:verify';

if (!RAPID_BASE) console.warn('NAC service: RAPID_BASE not set');
if (!CLIENT_ID || !CLIENT_SECRET) console.warn('NAC service: CLIENT_ID/CLIENT_SECRET not set');
if (!REDIRECT_URI) console.warn('NAC service: REDIRECT_URI not set');

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

async function buildAuthorizationUrl({ phone, state }) {
  const oidc = await getOpenIdConfig();
  const authEndpoint = oidc.authorization_endpoint;
  const params = {
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    login_hint: phone,
    state,
    prompt: 'consent'
  };
  return `${authEndpoint}?${querystring.stringify(params)}`;
}

async function exchangeCodeForToken({ code }) {
  const oidc = await getOpenIdConfig();
  const tokenEndpoint = oidc.token_endpoint;
  const data = querystring.stringify({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    redirect_uri: REDIRECT_URI
  });

  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (RAPID_KEY) {
    headers['X-RapidAPI-Host'] = RAPID_HOST;
    headers['X-RapidAPI-Key'] = RAPID_KEY;
  }

  const resp = await axios.post(tokenEndpoint, data, { headers });
  return resp.data;
}

async function verifyPhoneNumber({ accessToken, phoneNumber }) {
  const url = `${RAPID_BASE}/passthrough/camara/v1/number-verification/number-verification/v0/verify`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  };
  if (RAPID_KEY) {
    headers['X-RapidAPI-Host'] = RAPID_HOST;
    headers['X-RapidAPI-Key'] = RAPID_KEY;
  }

  const resp = await axios.post(url, { phoneNumber }, { headers });
  return resp.data;
}

async function getDevicePhoneNumber({ accessToken }) {
  const url = `${RAPID_BASE}/passthrough/camara/v1/number-verification/number-verification/v0/device-phone-number`;
  const headers = { Authorization: `Bearer ${accessToken}` };
  if (RAPID_KEY) {
    headers['X-RapidAPI-Host'] = RAPID_HOST;
    headers['X-RapidAPI-Key'] = RAPID_KEY;
  }
  const resp = await axios.get(url, { headers });
  return resp.data;
}

module.exports = {
  buildAuthorizationUrl,
  exchangeCodeForToken,
  verifyPhoneNumber,
  getDevicePhoneNumber,
};
