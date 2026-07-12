import axios from 'axios';

// In dev, relative '/api' goes through Vite's proxy (see vite.config.js) to
// localhost:5000. In production there is no such proxy, so VITE_API_URL must
// point directly at the deployed backend's public URL.
const API_URL = `${import.meta.env.VITE_API_URL || ''}/api`;

export const api = {
  async getLoginUrl() {
    const response = await axios.post(`${API_URL}/auth/login`);
    return response.data;
  },

  async exchangeCode(code, codeVerifier) {
    const response = await axios.post(`${API_URL}/auth/callback`, { code, codeVerifier });
    return response.data;
  },

  async refreshAccessToken(refreshToken) {
    const response = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
    return response.data;
  },

  async fetchUserProfile(accessToken) {
    const response = await axios.get(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return response.data;
  },

  async fetchPlaylists(accessToken) {
    const response = await axios.get(`${API_URL}/playlists`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return response.data;
  },

  async fetchPlaylistTracks(accessToken, playlistId) {
    const response = await axios.get(`${API_URL}/playlists/${playlistId}/tracks`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return response.data;
  },

  async startHeardleGame(playlistId, tracks) {
    const response = await axios.post(`${API_URL}/game/heardle/start`, {
      playlistId,
      tracks
    });
    return response.data;
  },

  async makeHeardleGuess(gameSession, guessId) {
    const response = await axios.post(`${API_URL}/game/heardle/guess`, {
      gameSession,
      guessId
    });
    return response.data;
  },

  async skipHeardleGuess(gameSession) {
    const response = await axios.post(`${API_URL}/game/heardle/skip`, { gameSession });
    return response.data;
  },

  async getHeardleSnippetLengths() {
    const response = await axios.get(`${API_URL}/game/heardle/snippet-lengths`);
    return response.data;
  },

  async startHitsterGame(playlistId, tracks) {
    const response = await axios.post(`${API_URL}/game/hitster/start`, {
      playlistId,
      tracks
    });
    return response.data;
  },

  async placeHitsterCard(gameSession, position, tracks) {
    const response = await axios.post(`${API_URL}/game/hitster/place`, {
      gameSession,
      position,
      tracks
    });
    return response.data;
  },

  async getHitsterSnippetLength() {
    const response = await axios.get(`${API_URL}/game/hitster/snippet-length`);
    return response.data;
  },

  async startHearsterGame(playlistId, tracks) {
    const response = await axios.post(`${API_URL}/game/hearster/start`, {
      playlistId,
      tracks
    });
    return response.data;
  },

  async guessHearster(gameSession, guessId) {
    const response = await axios.post(`${API_URL}/game/hearster/guess`, {
      gameSession,
      guessId
    });
    return response.data;
  },

  async skipHearster(gameSession) {
    const response = await axios.post(`${API_URL}/game/hearster/skip`, { gameSession });
    return response.data;
  },

  async placeHearsterCard(gameSession, position, tracks) {
    const response = await axios.post(`${API_URL}/game/hearster/place`, {
      gameSession,
      position,
      tracks
    });
    return response.data;
  },

  async getHearsterSnippetLengths() {
    const response = await axios.get(`${API_URL}/game/hearster/snippet-lengths`);
    return response.data;
  }
};
