import { useState, useEffect } from 'react';
import { api } from '../api';

export function HearsterGame({ playlist, onBack, spotifyPlayer }) {
  const { deviceReady, isPlaying, error: playerError, playSnippet, playFullTrack, pause } = spotifyPlayer;
  const [gameSession, setGameSession] = useState(null);
  const [snippetLengths, setSnippetLengths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [filteredTracks, setFilteredTracks] = useState([]);
  const [lastResult, setLastResult] = useState(null);

  useEffect(() => {
    getSnippetLengths();
    startGame();

    return () => {
      pause();
    };
  }, [playlist]);

  const getSnippetLengths = async () => {
    try {
      const data = await api.getHearsterSnippetLengths();
      setSnippetLengths(data.lengths);
    } catch (err) {
      console.error('Failed to fetch snippet lengths', err);
    }
  };

  const startGame = async () => {
    try {
      setLoading(true);
      setLastResult(null);
      const session = await api.startHearsterGame(playlist.id, playlist.tracks);
      setGameSession(session);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start game');
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
      const updated = await api.guessHearster(gameSession, track.id);
      setGameSession(updated);
      setSearchInput('');
      setFilteredTracks([]);

      if (updated.phase === 'placing') {
        playFullTrack(updated.currentTrack.id);
      } else if (updated.status === 'playing') {
        const length = snippetLengths[updated.attempt] ?? snippetLengths[snippetLengths.length - 1];
        playSnippet(updated.currentTrack.id, length);
      } else {
        pause();
      }
    } catch (err) {
      setError('Failed to make guess');
      console.error(err);
    }
  };

  const handleSkip = async () => {
    try {
      const updated = await api.skipHearster(gameSession);
      setGameSession(updated);

      if (updated.status === 'playing') {
        const length = snippetLengths[updated.attempt] ?? snippetLengths[snippetLengths.length - 1];
        playSnippet(updated.currentTrack.id, length);
      } else {
        pause();
      }
    } catch (err) {
      setError('Failed to skip');
      console.error(err);
    }
  };

  const handlePlaceCard = async (position) => {
    try {
      const updated = await api.placeHearsterCard(gameSession, position, playlist.tracks);
      const placedCard = updated.timeline.find(
        c => !gameSession.timeline.some(existing => existing.id === c.id)
      );
      setGameSession(updated);

      if (updated.status === 'playing') {
        // Correct placement — starting a fresh guessing round, so clear the
        // stale result rather than leaving it set for a later failure to
        // mistakenly display.
        setLastResult(null);
        const length = snippetLengths[0];
        playSnippet(updated.currentTrack.id, length);
      } else {
        setLastResult({ correct: updated.status !== 'lost', card: placedCard });
        pause();
      }
    } catch (err) {
      setError('Failed to place card');
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

  const isGameOver = gameSession.status !== 'playing';
  const isGuessing = !isGameOver && gameSession.phase === 'guessing';
  const isPlacing = !isGameOver && gameSession.phase === 'placing';
  const { timeline, currentTrack, score } = gameSession;
  const currentSnippetLength = snippetLengths[gameSession.attempt] || snippetLengths[snippetLengths.length - 1];

  return (
    <div className="page game-page">
      <div className="game-header">
        <button onClick={onBack} className="btn btn-small">← Back</button>
        <h2>{playlist.name} — Hear-ster</h2>
        <div className="attempts">Score: {score}</div>
      </div>

      <div className="hitster-content">
        {isGuessing && (
          <div className="game-content">
            <div className="player-section">
              <div className={`album-art-hidden ${isPlaying ? 'playing' : ''}`}>?</div>
              <div className="snippet-info">
                <p className="snippet-length">Now playing: {currentSnippetLength}s snippet</p>
                <button
                  onClick={() => playSnippet(currentTrack.id, currentSnippetLength)}
                  className="btn btn-primary"
                  disabled={!deviceReady}
                >
                  {!deviceReady ? 'Connecting to Spotify...' : (isPlaying ? '⏸ Pause' : '▶ Play')}
                </button>
              </div>
            </div>

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

              <p className="hitster-instructions">
                Attempt {gameSession.attempt + 1} / {gameSession.maxAttempts}
              </p>
            </div>
          </div>
        )}

        {isPlacing && (
          <div className="hitster-current-card">
            <h3>{currentTrack.name}</h3>
            <p className="artists">{currentTrack.artists.join(', ')}</p>
            <p className="hitster-instructions">Now place it in the timeline!</p>
          </div>
        )}

        {isGameOver && (
          <div className="result-section">
            <div className={`result ${lastResult?.correct === false || gameSession.status === 'lost' ? 'lost' : 'won'}`}>
              {gameSession.status === 'lost'
                ? (lastResult ? '😢 Wrong spot!' : "😢 Couldn't guess it in time!")
                : '🎉 Timeline complete!'}
            </div>

            {!lastResult && gameSession.status === 'lost' && (
              <div className="track-reveal">
                <h3>{currentTrack.name}</h3>
                <p className="artists">{currentTrack.artists.join(', ')}</p>
              </div>
            )}

            {lastResult?.card && (
              <div className="track-reveal">
                <h3>{lastResult.card.name}</h3>
                <p className="artists">{lastResult.card.artists.join(', ')}</p>
                <p className="album">{lastResult.card.releaseYear}</p>
              </div>
            )}

            <div className="stats">
              <p>Final score: {score}</p>
            </div>

            <div className="result-actions">
              <button onClick={handlePlayAgain} className="btn btn-primary btn-large">Play Again</button>
              <button onClick={onBack} className="btn btn-large">Back to Playlists</button>
            </div>
          </div>
        )}

        <div className="timeline">
          {isPlacing && (
            <button className="timeline-gap" onClick={() => handlePlaceCard(0)}>+</button>
          )}
          {timeline.map((card, i) => {
            const isFailedCard = isGameOver && lastResult?.correct === false && card.id === lastResult.card?.id;
            return (
              <div key={card.id} className="timeline-track">
                <div className="timeline-card">
                  {card.album.image && <img src={card.album.image} alt={card.name} />}
                  <div className={`timeline-year ${isFailedCard ? 'timeline-year-wrong' : ''}`}>{card.releaseYear}</div>
                  <div className="timeline-name">{card.name}</div>
                  <div className="timeline-artist">{card.artists.join(', ')}</div>
                </div>
                {isPlacing && (
                  <button className="timeline-gap" onClick={() => handlePlaceCard(i + 1)}>+</button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
