import express from 'express';
import axios from 'axios';
import crypto from 'crypto';

const router = express.Router();
const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';

const REDIRECT_URI = process.env.REDIRECT_URI || 'http://127.0.0.1:5173/callback';
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  throw new Error('Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env');
}

const generateCodeChallenge = () => {
  const codeVerifier = crypto.randomBytes(32).toString('hex');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return { codeVerifier, codeChallenge };
};

router.post('/login', (req, res) => {
  const { codeVerifier, codeChallenge } = generateCodeChallenge();
  const state = crypto.randomBytes(16).toString('hex');

  res.json({
    url: `${SPOTIFY_AUTH_URL}?${new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      state,
      scope: 'streaming user-read-private user-read-email playlist-read-private playlist-read-collaborative user-library-read user-read-playback-state user-modify-playback-state user-top-read user-read-recently-played user-follow-read'
    }).toString()}`,
    codeVerifier,
    state
  });
});

router.post('/callback', async (req, res) => {
  const { code, codeVerifier } = req.body;

  if (!code || !codeVerifier) {
    return res.status(400).json({ error: 'Missing code or codeVerifier' });
  }

  try {
    const response = await axios.post(SPOTIFY_TOKEN_URL, new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code_verifier: codeVerifier
    }).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const { access_token, refresh_token, expires_in } = response.data;

    res.json({
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresIn: expires_in
    });
  } catch (error) {
    console.error('OAuth callback error:', error.response?.data || error.message);
    res.status(400).json({ error: 'Failed to exchange code for token' });
  }
});

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Missing refreshToken' });
  }

  try {
    const response = await axios.post(SPOTIFY_TOKEN_URL, new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    }).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const { access_token, expires_in } = response.data;

    res.json({
      accessToken: access_token,
      expiresIn: expires_in
    });
  } catch (error) {
    console.error('Token refresh error:', error.response?.data || error.message);
    res.status(400).json({ error: 'Failed to refresh token' });
  }
});

router.get('/me', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  try {
    const response = await axios.get(`${SPOTIFY_API_URL}/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    res.json(response.data);
  } catch (error) {
    console.error('User profile error:', error.response?.status);
    res.status(error.response?.status || 500).json({ error: 'Failed to fetch user profile' });
  }
});

export const authRouter = router;
