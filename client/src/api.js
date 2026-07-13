import axios from 'axios';

// In dev, relative '/api' goes through Vite's proxy (see vite.config.js) to
// localhost:5000. In production there is no such proxy, so VITE_API_URL must
// point directly at the deployed backend's public URL.
const API_URL = `${import.meta.env.VITE_API_URL || ''}/api`;

const RETRY_DELAYS_MS = [3000, 6000, 10000]; // grows to give a cold-starting free-tier host time to wake up

const client = axios.create();

// A cold-starting free-tier backend can fail requests with a network-level
// error (nothing ever reached the server) until it wakes up. Retrying those
// is safe since the server never processed the request. A response that DID
// reach the server (any HTTP status) is never retried here.
client.interceptors.response.use(
  response => response,
  async error => {
    const config = error.config;
    const isNetworkLevelFailure = !error.response;
    config.__retryCount = config.__retryCount || 0;

    if (!isNetworkLevelFailure || config.__retryCount >= RETRY_DELAYS_MS.length) {
      return Promise.reject(error);
    }

    const delay = RETRY_DELAYS_MS[config.__retryCount];
    config.__retryCount += 1;
    await new Promise(r => setTimeout(r, delay));
    return client(config);
  }
);

export const api = {
  async getLoginUrl(redirectUri) {
    const response = await client.post(`${API_URL}/auth/login`, { redirectUri });
    return response.data;
  },

  async exchangeCode(code, codeVerifier, redirectUri) {
    const response = await client.post(`${API_URL}/auth/callback`, { code, codeVerifier, redirectUri });
    return response.data;
  },

  async refreshAccessToken(refreshToken) {
    const response = await client.post(`${API_URL}/auth/refresh`, { refreshToken });
    return response.data;
  },

  async fetchUserProfile(accessToken) {
    const response = await client.get(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return response.data;
  },

  async fetchPlaylists(accessToken) {
    const response = await client.get(`${API_URL}/playlists`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return response.data;
  },

  async fetchPlaylistTracks(accessToken, playlistId) {
    const response = await client.get(`${API_URL}/playlists/${playlistId}/tracks`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return response.data;
  },

  async startHeardleGame(playlistId, tracks) {
    const response = await client.post(`${API_URL}/game/heardle/start`, {
      playlistId,
      tracks
    });
    return response.data;
  },

  async makeHeardleGuess(gameSession, guessId) {
    const response = await client.post(`${API_URL}/game/heardle/guess`, {
      gameSession,
      guessId
    });
    return response.data;
  },

  async skipHeardleGuess(gameSession) {
    const response = await client.post(`${API_URL}/game/heardle/skip`, { gameSession });
    return response.data;
  },

  async getHeardleSnippetLengths() {
    const response = await client.get(`${API_URL}/game/heardle/snippet-lengths`);
    return response.data;
  },

  async startHitsterGame(playlistId, tracks) {
    const response = await client.post(`${API_URL}/game/hitster/start`, {
      playlistId,
      tracks
    });
    return response.data;
  },

  async placeHitsterCard(gameSession, position) {
    const response = await client.post(`${API_URL}/game/hitster/place`, {
      gameSession,
      position
    });
    return response.data;
  },

  async getHitsterSnippetLength() {
    const response = await client.get(`${API_URL}/game/hitster/snippet-length`);
    return response.data;
  },

  async startHearsterGame(playlistId, tracks) {
    const response = await client.post(`${API_URL}/game/hearster/start`, {
      playlistId,
      tracks
    });
    return response.data;
  },

  async guessHearster(gameSession, guessId) {
    const response = await client.post(`${API_URL}/game/hearster/guess`, {
      gameSession,
      guessId
    });
    return response.data;
  },

  async skipHearster(gameSession) {
    const response = await client.post(`${API_URL}/game/hearster/skip`, { gameSession });
    return response.data;
  },

  async placeHearsterCard(gameSession, position) {
    const response = await client.post(`${API_URL}/game/hearster/place`, {
      gameSession,
      position
    });
    return response.data;
  },

  async getHearsterSnippetLengths() {
    const response = await client.get(`${API_URL}/game/hearster/snippet-lengths`);
    return response.data;
  },

  async startDuelGame(playlistId, tracks, winScore) {
    const response = await client.post(`${API_URL}/game/duel/start`, {
      playlistId,
      tracks,
      winScore
    });
    return response.data;
  },

  async guessDuel(gameSession, team, guessId) {
    const response = await client.post(`${API_URL}/game/duel/guess`, {
      gameSession,
      team,
      guessId
    });
    return response.data;
  },

  async placeDuelCard(gameSession, team, position) {
    const response = await client.post(`${API_URL}/game/duel/place`, {
      gameSession,
      team,
      position
    });
    return response.data;
  },

  async failDuelRound(gameSession) {
    const response = await client.post(`${API_URL}/game/duel/fail-round`, { gameSession });
    return response.data;
  }
};
