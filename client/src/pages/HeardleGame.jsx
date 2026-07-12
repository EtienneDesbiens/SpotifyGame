import { useState, useEffect } from 'react';
import { api } from '../api';

export function HeardleGame({ playlist, onBack, spotifyPlayer }) {
  const { deviceReady, isPlaying, error: playerError, playSnippet, playFullTrack, pause } = spotifyPlayer;
  const [gameSession, setGameSession] = useState(null);
  const [snippetLengths, setSnippetLengths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [filteredTracks, setFilteredTracks] = useState([]);

  useEffect(() => {
    getSnippetLengths();
    startGame();

    // Stop playback whenever this game screen goes away, however that
    // happens (Back/Play Again button, or otherwise) — the shared player
    // persists across game rounds now, so nothing else stops it automatically.
    return () => {
      pause();
    };
  }, [playlist]);

  // Playback is never auto-triggered: the Spotify Web Playback SDK only
  // produces audio when a play command originates from a real user
  // gesture (click), so every snippet play must come from a button click.

  const getSnippetLengths = async () => {
    try {
      const data = await api.getHeardleSnippetLengths();
      setSnippetLengths(data.lengths);
    } catch (err) {
      console.error('Failed to fetch snippet lengths', err);
    }
  };

  const startGame = async () => {
    try {
      setLoading(true);
      const session = await api.startHeardleGame(playlist.id, playlist.tracks);
      setGameSession(session);
    } catch (err) {
      setError('Failed to start game');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePlayAgain = () => {
    pause();
    setSearchInput('');
    setFilteredTracks([]);
    startGame();
  };

  const handleSearchChange = (value) => {
    setSearchInput(value);
    if (value.length > 0) {
      const filtered = playlist.tracks.filter(track =>
        track.name.toLowerCase().includes(value.toLowerCase()) ||
        track.artists.some(a => a.toLowerCase().includes(value.toLowerCase()))
      );
      setFilteredTracks(filtered);
    } else {
      setFilteredTracks([]);
    }
  };

  const handleGuess = async (track) => {
    try {
      const updated = await api.makeHeardleGuess(gameSession, track.id);
      setGameSession(updated);
      setSearchInput('');
      setFilteredTracks([]);

      if (updated.status !== 'playing') {
        playFullTrack(updated.track.id);
      } else {
        const length = snippetLengths[updated.attempt] ?? snippetLengths[snippetLengths.length - 1];
        playSnippet(updated.track.id, length);
      }
    } catch (err) {
      setError('Failed to make guess');
      console.error(err);
    }
  };

  const handleSkip = async () => {
    try {
      const updated = await api.skipHeardleGuess(gameSession);
      setGameSession(updated);

      if (updated.status !== 'playing') {
        playFullTrack(updated.track.id);
      } else {
        const length = snippetLengths[updated.attempt] ?? snippetLengths[snippetLengths.length - 1];
        playSnippet(updated.track.id, length);
      }
    } catch (err) {
      setError('Failed to skip');
      console.error(err);
    }
  };

  if (loading) {
    return <div className="page game-page"><div className="loading">Starting game...</div></div>;
  }

  if (error || playerError) {
    return (
      <div className="page game-page">
        <div className="error">{error || playerError}</div>
        <button onClick={onBack} className="btn">Back to Playlists</button>
      </div>
    );
  }

  if (!gameSession) {
    return <div className="page game-page"><div className="loading">Loading...</div></div>;
  }

  const currentSnippetLength = snippetLengths[gameSession.attempt] || snippetLengths[snippetLengths.length - 1];
  const isGameOver = gameSession.status !== 'playing';

  return (
    <div className="page game-page">
      <div className="game-header">
        <button onClick={onBack} className="btn btn-small">← Back</button>
        <h2>{playlist.name}</h2>
        <div className="attempts">Attempt {gameSession.attempt + 1} / {gameSession.maxAttempts}</div>
      </div>

      <div className="game-content">
        <div className="player-section">
          {!isGameOver && (
            <div className={`album-art-hidden ${isPlaying ? 'playing' : ''}`}>?</div>
          )}
          <div className="snippet-info">
            <p className="snippet-length">Now playing: {currentSnippetLength}s snippet</p>
            {!isGameOver && (
              <button
                onClick={() => playSnippet(gameSession.track.id, currentSnippetLength)}
                className="btn btn-primary"
                disabled={!deviceReady}
              >
                {!deviceReady ? 'Connecting to Spotify...' : (isPlaying ? '⏸ Pause' : '▶ Play')}
              </button>
            )}
          </div>
        </div>

        {!isGameOver && (
          <div className="guess-section">
            <input
              type="text"
              placeholder="Type song name or artist..."
              value={searchInput}
              onChange={e => handleSearchChange(e.target.value)}
              className="search-input"
              autoFocus
            />

            {filteredTracks.length > 0 && (
              <div className="suggestions">
                {filteredTracks.slice(0, 8).map(track => (
                  <div
                    key={track.id}
                    className="suggestion-item"
                    onClick={() => handleGuess(track)}
                  >
                    <div className="track-info">
                      <div className="track-name">{track.name}</div>
                      <div className="track-artist">{track.artists.join(', ')}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {gameSession.attempt < snippetLengths.length - 1 && (
              <button onClick={handleSkip} className="btn btn-secondary">Skip to next hint</button>
            )}
          </div>
        )}

        {isGameOver && (
          <div className="result-section">
            <div className={`result ${gameSession.status}`}>
              {gameSession.status === 'won' ? '🎉 You won!' : '😢 Game over'}
            </div>

            <div className="track-reveal">
              <h3>{gameSession.track.name}</h3>
              <p className="artists">{gameSession.track.artists.join(', ')}</p>
              <p className="album">{gameSession.track.album.name}</p>
              {gameSession.track.album.image && (
                <img src={gameSession.track.album.image} alt="Album art" className="album-art-reveal" />
              )}
            </div>

            <div className="stats">
              <p>Attempts: {gameSession.attempt} / {gameSession.maxAttempts}</p>
            </div>

            <div className="result-actions">
              <button onClick={handlePlayAgain} className="btn btn-primary btn-large">Play Again</button>
              <button onClick={onBack} className="btn btn-large">Back to Playlists</button>
            </div>
          </div>
        )}
      </div>

      <div className="guesses-history">
        <h4>Guesses:</h4>
        <div className="guesses-list">
          {gameSession.guesses.map((guess, i) => {
            const track = playlist.tracks.find(t => t.id === guess.guessId);
            const label = guess.skipped ? 'Skipped' : (track ? track.name : 'Unknown');
            return (
              <div key={i} className={`guess-item ${guess.isCorrect ? 'correct' : guess.skipped ? 'skipped' : 'wrong'}`}>
                <span className="guess-number">{i + 1}.</span>
                <span className="guess-text">{label}</span>
                <span className="guess-status">{guess.isCorrect ? '✓' : guess.skipped ? '⏭' : '✗'}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
