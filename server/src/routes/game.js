import express from 'express';
import axios from 'axios';

const router = express.Router();
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';

const HEARDLE_SNIPPET_LENGTHS = [1, 2, 4, 7, 11, 16]; // seconds
const MAX_ATTEMPTS = 6;

// Tracks are large (a big playlist can be several MB of JSON) and don't
// change during a game, so they're cached here by gameId instead of being
// round-tripped by the client on every guess/placement. Entries are removed
// when a game ends; a sweep also clears anything abandoned mid-game.
const trackCacheByGameId = new Map();
const GAME_TTL_MS = 60 * 60 * 1000; // 1 hour

const cacheTracks = (gameId, tracks) => {
  trackCacheByGameId.set(gameId, { tracks, lastAccess: Date.now() });
};

const getCachedTracks = (gameId) => {
  const entry = trackCacheByGameId.get(gameId);
  if (!entry) return null;
  entry.lastAccess = Date.now();
  return entry.tracks;
};

setInterval(() => {
  const cutoff = Date.now() - GAME_TTL_MS;
  for (const [gameId, entry] of trackCacheByGameId) {
    if (entry.lastAccess < cutoff) trackCacheByGameId.delete(gameId);
  }
}, GAME_TTL_MS).unref();

const getAuthHeader = (req) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) throw new Error('Missing authorization token');
  return { Authorization: `Bearer ${token}` };
};

const filterValidTracks = (tracks) => {
  return tracks.filter(t => t.durationMs >= 30000);
};

const pickRandomTrack = (tracks) => {
  const validTracks = filterValidTracks(tracks);
  if (validTracks.length === 0) throw new Error('No valid tracks in playlist');
  return validTracks[Math.floor(Math.random() * validTracks.length)];
};

router.post('/heardle/start', async (req, res) => {
  const { playlistId, tracks } = req.body;

  if (!playlistId || !tracks || tracks.length === 0) {
    return res.status(400).json({ error: 'Missing playlistId or tracks' });
  }

  try {
    const track = pickRandomTrack(tracks);

    const session = {
      gameId: Math.random().toString(36).substring(7),
      mode: 'heardle',
      playlistId,
      track: {
        id: track.id,
        name: track.name,
        artists: track.artists,
        album: track.album,
        durationMs: track.durationMs
      },
      attempt: 0,
      maxAttempts: MAX_ATTEMPTS,
      guesses: [],
      status: 'playing',
      revealed: false
    };

    res.json(session);
  } catch (error) {
    console.error('Game start error:', error.message);
    res.status(500).json({ error: 'Failed to start game' });
  }
});

const advanceSession = (gameSession, entry) => {
  const newGuesses = [...gameSession.guesses, entry];
  return {
    ...gameSession,
    attempt: newGuesses.length,
    guesses: newGuesses,
    status: entry.isCorrect ? 'won' : (newGuesses.length >= MAX_ATTEMPTS ? 'lost' : 'playing'),
    revealed: entry.isCorrect || newGuesses.length >= MAX_ATTEMPTS
  };
};

router.post('/heardle/guess', (req, res) => {
  const { gameSession, guessId } = req.body;

  if (!gameSession || !guessId) {
    return res.status(400).json({ error: 'Missing gameSession or guessId' });
  }

  const isCorrect = guessId === gameSession.track.id;
  res.json(advanceSession(gameSession, { guessId, isCorrect, skipped: false }));
});

router.post('/heardle/skip', (req, res) => {
  const { gameSession } = req.body;

  if (!gameSession) {
    return res.status(400).json({ error: 'Missing gameSession' });
  }

  if (gameSession.status !== 'playing') {
    return res.status(400).json({ error: 'Game is already over' });
  }

  res.json(advanceSession(gameSession, { guessId: null, isCorrect: false, skipped: true }));
});

router.get('/heardle/snippet-lengths', (req, res) => {
  res.json({
    lengths: HEARDLE_SNIPPET_LENGTHS,
    maxAttempts: MAX_ATTEMPTS
  });
});

const HITSTER_SNIPPET_LENGTH = 20; // seconds

const getReleaseYear = (track) => {
  const year = parseInt(track.album?.releaseDate?.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
};

const toTimelineCard = (track) => ({
  id: track.id,
  name: track.name,
  artists: track.artists,
  album: track.album,
  releaseYear: getReleaseYear(track)
});

const pickNextTrack = (tracks, usedIds) => {
  const validTracks = filterValidTracks(tracks).filter(
    t => !usedIds.includes(t.id) && getReleaseYear(t) !== null
  );
  if (validTracks.length === 0) return null;
  return validTracks[Math.floor(Math.random() * validTracks.length)];
};

router.post('/hitster/start', async (req, res) => {
  const { playlistId, tracks } = req.body;

  if (!playlistId || !tracks || tracks.length === 0) {
    return res.status(400).json({ error: 'Missing playlistId or tracks' });
  }

  try {
    const seedTrack = pickNextTrack(tracks, []);
    if (!seedTrack) throw new Error('No valid tracks with a known release year in playlist');

    const nextTrack = pickNextTrack(tracks, [seedTrack.id]);
    if (!nextTrack) throw new Error('Not enough valid tracks to start a Hitster round');

    const session = {
      gameId: Math.random().toString(36).substring(7),
      mode: 'hitster',
      playlistId,
      timeline: [toTimelineCard(seedTrack)],
      currentTrack: {
        id: nextTrack.id,
        name: nextTrack.name,
        artists: nextTrack.artists,
        album: nextTrack.album,
        durationMs: nextTrack.durationMs
      },
      usedTrackIds: [seedTrack.id, nextTrack.id],
      score: 0,
      status: 'playing'
    };

    cacheTracks(session.gameId, tracks);
    res.json(session);
  } catch (error) {
    console.error('Hitster start error:', error.message);
    res.status(400).json({ error: error.message || 'Failed to start game' });
  }
});

router.post('/hitster/place', (req, res) => {
  const { gameSession, position } = req.body;

  if (!gameSession || position === undefined) {
    return res.status(400).json({ error: 'Missing gameSession or position' });
  }

  if (gameSession.status !== 'playing') {
    return res.status(400).json({ error: 'Game is already over' });
  }

  const tracks = getCachedTracks(gameSession.gameId);
  if (!tracks) {
    return res.status(410).json({ error: 'Game session expired, please start a new game' });
  }

  const { timeline, currentTrack, usedTrackIds, score } = gameSession;
  const fullCurrentTrack = tracks.find(t => t.id === currentTrack.id);
  const newYear = getReleaseYear(fullCurrentTrack);
  const years = timeline.map(c => c.releaseYear);

  const isCorrect =
    (position === 0 || years[position - 1] <= newYear) &&
    (position === timeline.length || newYear <= years[position]);

  if (!isCorrect) {
    trackCacheByGameId.delete(gameSession.gameId);
    return res.json({
      ...gameSession,
      status: 'lost',
      timeline: [
        ...timeline.slice(0, position),
        toTimelineCard(fullCurrentTrack),
        ...timeline.slice(position)
      ].sort((a, b) => a.releaseYear - b.releaseYear)
    });
  }

  const newTimeline = [...timeline, toTimelineCard(fullCurrentTrack)]
    .sort((a, b) => a.releaseYear - b.releaseYear);

  const nextTrack = pickNextTrack(tracks, usedTrackIds);

  if (!nextTrack) {
    trackCacheByGameId.delete(gameSession.gameId);
    return res.json({
      ...gameSession,
      timeline: newTimeline,
      score: score + 1,
      status: 'won',
      currentTrack: null
    });
  }

  res.json({
    ...gameSession,
    timeline: newTimeline,
    usedTrackIds: [...usedTrackIds, nextTrack.id],
    score: score + 1,
    status: 'playing',
    currentTrack: {
      id: nextTrack.id,
      name: nextTrack.name,
      artists: nextTrack.artists,
      album: nextTrack.album,
      durationMs: nextTrack.durationMs
    }
  });
});

router.get('/hitster/snippet-length', (req, res) => {
  res.json({ length: HITSTER_SNIPPET_LENGTH });
});

// Hear-ster: guess the song Heardle-style, then place it on the Hitster timeline.
router.post('/hearster/start', async (req, res) => {
  const { playlistId, tracks } = req.body;

  if (!playlistId || !tracks || tracks.length === 0) {
    return res.status(400).json({ error: 'Missing playlistId or tracks' });
  }

  try {
    const seedTrack = pickNextTrack(tracks, []);
    if (!seedTrack) throw new Error('No valid tracks with a known release year in playlist');

    const nextTrack = pickNextTrack(tracks, [seedTrack.id]);
    if (!nextTrack) throw new Error('Not enough valid tracks to start a Hear-ster round');

    const session = {
      gameId: Math.random().toString(36).substring(7),
      mode: 'hearster',
      playlistId,
      timeline: [toTimelineCard(seedTrack)],
      currentTrack: {
        id: nextTrack.id,
        name: nextTrack.name,
        artists: nextTrack.artists,
        album: nextTrack.album,
        durationMs: nextTrack.durationMs
      },
      usedTrackIds: [seedTrack.id, nextTrack.id],
      phase: 'guessing',
      attempt: 0,
      maxAttempts: MAX_ATTEMPTS,
      guesses: [],
      score: 0,
      status: 'playing'
    };

    cacheTracks(session.gameId, tracks);
    res.json(session);
  } catch (error) {
    console.error('Hear-ster start error:', error.message);
    res.status(400).json({ error: error.message || 'Failed to start game' });
  }
});

const advanceHearsterGuess = (gameSession, entry) => {
  const newGuesses = [...gameSession.guesses, entry];

  if (entry.isCorrect) {
    return {
      ...gameSession,
      attempt: newGuesses.length,
      guesses: newGuesses,
      phase: 'placing'
    };
  }

  const outOfAttempts = newGuesses.length >= gameSession.maxAttempts;
  return {
    ...gameSession,
    attempt: newGuesses.length,
    guesses: newGuesses,
    status: outOfAttempts ? 'lost' : 'playing'
  };
};

router.post('/hearster/guess', (req, res) => {
  const { gameSession, guessId } = req.body;

  if (!gameSession || !guessId) {
    return res.status(400).json({ error: 'Missing gameSession or guessId' });
  }

  if (gameSession.status !== 'playing' || gameSession.phase !== 'guessing') {
    return res.status(400).json({ error: 'Not currently guessing' });
  }

  const isCorrect = guessId === gameSession.currentTrack.id;
  res.json(advanceHearsterGuess(gameSession, { guessId, isCorrect, skipped: false }));
});

router.post('/hearster/skip', (req, res) => {
  const { gameSession } = req.body;

  if (!gameSession) {
    return res.status(400).json({ error: 'Missing gameSession' });
  }

  if (gameSession.status !== 'playing' || gameSession.phase !== 'guessing') {
    return res.status(400).json({ error: 'Not currently guessing' });
  }

  res.json(advanceHearsterGuess(gameSession, { guessId: null, isCorrect: false, skipped: true }));
});

router.post('/hearster/place', (req, res) => {
  const { gameSession, position } = req.body;

  if (!gameSession || position === undefined) {
    return res.status(400).json({ error: 'Missing gameSession or position' });
  }

  if (gameSession.status !== 'playing' || gameSession.phase !== 'placing') {
    return res.status(400).json({ error: 'Not currently placing' });
  }

  const tracks = getCachedTracks(gameSession.gameId);
  if (!tracks) {
    return res.status(410).json({ error: 'Game session expired, please start a new game' });
  }

  const { timeline, currentTrack, usedTrackIds, score } = gameSession;
  const fullCurrentTrack = tracks.find(t => t.id === currentTrack.id);
  const newYear = getReleaseYear(fullCurrentTrack);
  const years = timeline.map(c => c.releaseYear);

  const isCorrect =
    (position === 0 || years[position - 1] <= newYear) &&
    (position === timeline.length || newYear <= years[position]);

  if (!isCorrect) {
    trackCacheByGameId.delete(gameSession.gameId);
    return res.json({
      ...gameSession,
      status: 'lost',
      timeline: [
        ...timeline.slice(0, position),
        toTimelineCard(fullCurrentTrack),
        ...timeline.slice(position)
      ].sort((a, b) => a.releaseYear - b.releaseYear)
    });
  }

  const newTimeline = [...timeline, toTimelineCard(fullCurrentTrack)]
    .sort((a, b) => a.releaseYear - b.releaseYear);

  const nextTrack = pickNextTrack(tracks, usedTrackIds);

  if (!nextTrack) {
    trackCacheByGameId.delete(gameSession.gameId);
    return res.json({
      ...gameSession,
      timeline: newTimeline,
      score: score + 1,
      status: 'won',
      currentTrack: null
    });
  }

  res.json({
    ...gameSession,
    timeline: newTimeline,
    usedTrackIds: [...usedTrackIds, nextTrack.id],
    score: score + 1,
    status: 'playing',
    phase: 'guessing',
    attempt: 0,
    guesses: [],
    currentTrack: {
      id: nextTrack.id,
      name: nextTrack.name,
      artists: nextTrack.artists,
      album: nextTrack.album,
      durationMs: nextTrack.durationMs
    }
  });
});

router.get('/hearster/snippet-lengths', (req, res) => {
  res.json({
    lengths: HEARDLE_SNIPPET_LENGTHS,
    maxAttempts: MAX_ATTEMPTS
  });
});

// Duel: two teams race to buzz in on a shared song, guess it, and place it
// on a shared timeline. First team to gameSession.winScore points wins.
const DEFAULT_WIN_SCORE = 5;
const MIN_WIN_SCORE = 1;
const MAX_WIN_SCORE = 50;

const normalizeWinScore = (winScore) => {
  const parsed = parseInt(winScore, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_WIN_SCORE;
  return Math.min(MAX_WIN_SCORE, Math.max(MIN_WIN_SCORE, parsed));
};

const advanceDuelTrack = (gameSession, tracks) => {
  const nextTrack = pickNextTrack(tracks, gameSession.usedTrackIds);

  if (!nextTrack) {
    trackCacheByGameId.delete(gameSession.gameId);
    const { red, blue } = gameSession.scores;
    return {
      ...gameSession,
      status: 'finished',
      winner: red === blue ? null : (red > blue ? 'red' : 'blue'),
      currentTrack: null
    };
  }

  return {
    ...gameSession,
    usedTrackIds: [...gameSession.usedTrackIds, nextTrack.id],
    currentTrack: {
      id: nextTrack.id,
      name: nextTrack.name,
      artists: nextTrack.artists,
      album: nextTrack.album,
      durationMs: nextTrack.durationMs
    }
  };
};

router.post('/duel/start', async (req, res) => {
  const { playlistId, tracks, winScore } = req.body;

  if (!playlistId || !tracks || tracks.length === 0) {
    return res.status(400).json({ error: 'Missing playlistId or tracks' });
  }

  try {
    const seedTrack = pickNextTrack(tracks, []);
    if (!seedTrack) throw new Error('No valid tracks with a known release year in playlist');

    const nextTrack = pickNextTrack(tracks, [seedTrack.id]);
    if (!nextTrack) throw new Error('Not enough valid tracks to start a Duel round');

    const session = {
      gameId: Math.random().toString(36).substring(7),
      mode: 'duel',
      playlistId,
      timeline: [toTimelineCard(seedTrack)],
      currentTrack: {
        id: nextTrack.id,
        name: nextTrack.name,
        artists: nextTrack.artists,
        album: nextTrack.album,
        durationMs: nextTrack.durationMs
      },
      usedTrackIds: [seedTrack.id, nextTrack.id],
      scores: { red: 0, blue: 0 },
      winScore: normalizeWinScore(winScore),
      status: 'playing',
      winner: null
    };

    cacheTracks(session.gameId, tracks);
    res.json(session);
  } catch (error) {
    console.error('Duel start error:', error.message);
    res.status(400).json({ error: error.message || 'Failed to start game' });
  }
});

router.post('/duel/guess', (req, res) => {
  const { gameSession, team, guessId } = req.body;

  if (!gameSession || !guessId || (team !== 'red' && team !== 'blue')) {
    return res.status(400).json({ error: 'Missing gameSession, team, or guessId' });
  }

  if (gameSession.status !== 'playing') {
    return res.status(400).json({ error: 'Game is already over' });
  }

  const isCorrect = guessId === gameSession.currentTrack.id;
  const scores = isCorrect
    ? { ...gameSession.scores, [team]: gameSession.scores[team] + 1 }
    : gameSession.scores;

  res.json({ ...gameSession, scores, correct: isCorrect });
});

router.post('/duel/place', (req, res) => {
  const { gameSession, team, position } = req.body;

  if (!gameSession || position === undefined || (team !== 'red' && team !== 'blue')) {
    return res.status(400).json({ error: 'Missing gameSession, team, or position' });
  }

  if (gameSession.status !== 'playing') {
    return res.status(400).json({ error: 'Game is already over' });
  }

  const tracks = getCachedTracks(gameSession.gameId);
  if (!tracks) {
    return res.status(410).json({ error: 'Game session expired, please start a new game' });
  }

  const { timeline, currentTrack } = gameSession;
  const fullCurrentTrack = tracks.find(t => t.id === currentTrack.id);
  const newYear = getReleaseYear(fullCurrentTrack);
  const years = timeline.map(c => c.releaseYear);

  const isCorrect =
    (position === 0 || years[position - 1] <= newYear) &&
    (position === timeline.length || newYear <= years[position]);

  const placedCard = toTimelineCard(fullCurrentTrack);

  if (!isCorrect) {
    const advanced = advanceDuelTrack({ ...gameSession, usedTrackIds: gameSession.usedTrackIds }, tracks);
    return res.json({ ...advanced, placed: false, revealedCard: placedCard });
  }

  const newTimeline = [...timeline, placedCard].sort((a, b) => a.releaseYear - b.releaseYear);
  const scores = { ...gameSession.scores, [team]: gameSession.scores[team] + 1 };

  if (scores[team] >= gameSession.winScore) {
    trackCacheByGameId.delete(gameSession.gameId);
    return res.json({
      ...gameSession,
      timeline: newTimeline,
      scores,
      status: 'finished',
      winner: team,
      currentTrack: null,
      placed: true,
      revealedCard: placedCard
    });
  }

  const advanced = advanceDuelTrack({ ...gameSession, timeline: newTimeline, scores }, tracks);
  res.json({ ...advanced, placed: true, revealedCard: placedCard });
});

router.post('/duel/fail-round', (req, res) => {
  const { gameSession } = req.body;

  if (!gameSession) {
    return res.status(400).json({ error: 'Missing gameSession' });
  }

  if (gameSession.status !== 'playing') {
    return res.status(400).json({ error: 'Game is already over' });
  }

  const tracks = getCachedTracks(gameSession.gameId);
  if (!tracks) {
    return res.status(410).json({ error: 'Game session expired, please start a new game' });
  }

  const fullCurrentTrack = tracks.find(t => t.id === gameSession.currentTrack.id);
  const revealedCard = toTimelineCard(fullCurrentTrack);
  const advanced = advanceDuelTrack(gameSession, tracks);

  res.json({ ...advanced, revealedCard });
});

export const gameRouter = router;
