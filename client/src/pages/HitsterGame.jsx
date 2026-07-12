import { useState, useEffect } from 'react';
import { api } from '../api';

export function HitsterGame({ playlist, onBack, spotifyPlayer }) {
  const { deviceReady, isPlaying, error: playerError, playSnippet, playFullTrack, pause } = spotifyPlayer;
  const [gameSession, setGameSession] = useState(null);
  const [snippetLength, setSnippetLength] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  useEffect(() => {
    getSnippetLength();
    startGame();

    return () => {
      pause();
    };
  }, [playlist]);

  const getSnippetLength = async () => {
    try {
      const data = await api.getHitsterSnippetLength();
      setSnippetLength(data.length);
    } catch (err) {
      console.error('Failed to fetch snippet length', err);
    }
  };

  const startGame = async () => {
    try {
      setLoading(true);
      setLastResult(null);
      const session = await api.startHitsterGame(playlist.id, playlist.tracks);
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
    startGame();
  };

  const handlePlaceCard = async (position) => {
    try {
      const updated = await api.placeHitsterCard(gameSession, position, playlist.tracks);
      const placedCard = updated.timeline.find(
        c => !gameSession.timeline.some(existing => existing.id === c.id)
      );
      setLastResult({ correct: updated.status !== 'lost', card: placedCard });
      setGameSession(updated);

      if (updated.status === 'playing') {
        playFullTrack(updated.currentTrack.id);
      } else {
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
  const { timeline, currentTrack, score } = gameSession;

  return (
    <div className="page game-page">
      <div className="game-header">
        <button onClick={onBack} className="btn btn-small">← Back</button>
        <h2>{playlist.name} — Hitster</h2>
        <div className="attempts">Score: {score}</div>
      </div>

      <div className="hitster-content">
        {!isGameOver && currentTrack && (
          <div className="hitster-current-card">
            <div className={`album-art-hidden ${isPlaying ? 'playing' : ''}`}>?</div>
            <button
              onClick={() => playSnippet(currentTrack.id, snippetLength)}
              className="btn btn-primary"
              disabled={!deviceReady}
            >
              {!deviceReady ? 'Connecting to Spotify...' : (isPlaying ? '⏸ Pause' : '▶ Play')}
            </button>
            <p className="hitster-instructions">Where does this song fit in the timeline?</p>
          </div>
        )}

        {isGameOver && (
          <div className="result-section">
            <div className={`result ${lastResult?.correct === false ? 'lost' : 'won'}`}>
              {lastResult?.correct === false ? '😢 Wrong spot!' : '🎉 Timeline complete!'}
            </div>
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
          {!isGameOver && (
            <button
              className="timeline-gap"
              onClick={() => handlePlaceCard(0)}
            >
              +
            </button>
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
              {!isGameOver && (
                <button
                  className="timeline-gap"
                  onClick={() => handlePlaceCard(i + 1)}
                >
                  +
                </button>
              )}
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
