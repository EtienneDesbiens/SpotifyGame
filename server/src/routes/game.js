import express from 'express';
import axios from 'axios';

const router = express.Router();
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';

const HEARDLE_SNIPPET_LENGTHS = [1, 2, 4, 7, 11, 16]; // seconds
const MAX_ATTEMPTS = 6;

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

    res.json(session);
  } catch (error) {
    console.error('Hitster start error:', error.message);
    res.status(400).json({ error: error.message || 'Failed to start game' });
  }
});

router.post('/hitster/place', (req, res) => {
  const { gameSession, position, tracks } = req.body;

  if (!gameSession || position === undefined || !tracks) {
    return res.status(400).json({ error: 'Missing gameSession, position, or tracks' });
  }

  if (gameSession.status !== 'playing') {
    return res.status(400).json({ error: 'Game is already over' });
  }

  const { timeline, currentTrack, usedTrackIds, score } = gameSession;
  const fullCurrentTrack = tracks.find(t => t.id === currentTrack.id);
  const newYear = getReleaseYear(fullCurrentTrack);
  const years = timeline.map(c => c.releaseYear);

  const isCorrect =
    (position === 0 || years[position - 1] <= newYear) &&
    (position === timeline.length || newYear <= years[position]);

  if (!isCorrect) {
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
  const { gameSession, position, tracks } = req.body;

  if (!gameSession || position === undefined || !tracks) {
    return res.status(400).json({ error: 'Missing gameSession, position, or tracks' });
  }

  if (gameSession.status !== 'playing' || gameSession.phase !== 'placing') {
    return res.status(400).json({ error: 'Not currently placing' });
  }

  const { timeline, currentTrack, usedTrackIds, score } = gameSession;
  const fullCurrentTrack = tracks.find(t => t.id === currentTrack.id);
  const newYear = getReleaseYear(fullCurrentTrack);
  const years = timeline.map(c => c.releaseYear);

  const isCorrect =
    (position === 0 || years[position - 1] <= newYear) &&
    (position === timeline.length || newYear <= years[position]);

  if (!isCorrect) {
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

export const gameRouter = router;
