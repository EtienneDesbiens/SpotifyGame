import { useState, useEffect, useRef } from 'react';
import { api } from '../api';

const OTHER_TEAM = { red: 'blue', blue: 'red' };
const TEAM_LABEL = { red: 'Red', blue: 'Blue' };
const WIN_SCORE = 5;

export function DuelGame({ playlist, onBack, spotifyPlayer }) {
  const { deviceReady, error: playerError, playSnippet, playFullTrack, pause } = spotifyPlayer;

  const [gameSession, setGameSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [roundPhase, setRoundPhase] = useState('listening');
  const [teamStatus, setTeamStatus] = useState({ red: 'active', blue: 'active' });
  const [activeTeam, setActiveTeam] = useState(null);
  const [lastRoundResult, setLastRoundResult] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [filteredTracks, setFilteredTracks] = useState([]);
  const [, setTimerTick] = useState(0);

  const roundStartAtRef = useRef(0);
  const guessStartAtRef = useRef(0);
  const timerIntervalRef = useRef(null);
  const replayTimeoutRef = useRef(null);

  useEffect(() => {
    startGame();

    return () => {
      pause();
      clearInterval(timerIntervalRef.current);
      clearTimeout(replayTimeoutRef.current);
    };
  }, [playlist]);

  useEffect(() => {
    if (roundPhase === 'guessing') {
      timerIntervalRef.current = setInterval(() => setTimerTick(t => t + 1), 100);
      return () => clearInterval(timerIntervalRef.current);
    }
  }, [roundPhase]);

  const startGame = async () => {
    try {
      setLoading(true);
      const session = await api.startDuelGame(playlist.id, playlist.tracks);
      setGameSession(session);
      startRound(session);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start game');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const startRound = (session) => {
    clearTimeout(replayTimeoutRef.current);
    setTeamStatus({ red: 'active', blue: 'active' });
    setActiveTeam(null);
    setLastRoundResult(null);
    setSearchInput('');
    setFilteredTracks([]);
    setRoundPhase('listening');
    roundStartAtRef.current = Date.now();
    playFullTrack(session.currentTrack.id);
  };

  const handlePlayAgain = () => {
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

  const handleBuzz = (team) => {
    if (roundPhase !== 'listening' || teamStatus[team] !== 'active') return;
    pause();
    setActiveTeam(team);
    guessStartAtRef.current = Date.now();
    setRoundPhase('guessing');
  };

  const handleSkip = (team) => {
    if (roundPhase !== 'listening' || teamStatus[team] !== 'active') return;
    const otherTeam = OTHER_TEAM[team];
    const updatedStatus = { ...teamStatus, [team]: 'skipped' };
    setTeamStatus(updatedStatus);

    if (updatedStatus[otherTeam] !== 'active') {
      resolveRoundFailure();
    }
  };

  const handleGuessSubmit = async (team, track) => {
    setSearchInput('');
    setFilteredTracks([]);
    try {
      const updated = await api.guessDuel(gameSession, team, track.id);
      setGameSession(updated);

      if (updated.correct) {
        setRoundPhase('placing');
        playFullTrack(updated.currentTrack.id);
      } else {
        handleGuessFailure(team);
      }
    } catch (err) {
      setError('Failed to make guess');
      console.error(err);
    }
  };

  const handleGiveUp = (team) => {
    handleGuessFailure(team);
  };

  const handleGuessFailure = (team) => {
    const otherTeam = OTHER_TEAM[team];
    const updatedStatus = { ...teamStatus, [team]: 'failed' };
    setTeamStatus(updatedStatus);
    setSearchInput('');
    setFilteredTracks([]);

    if (updatedStatus[otherTeam] === 'active') {
      const elapsedListenMs = guessStartAtRef.current - roundStartAtRef.current;
      const elapsedGuessMs = Date.now() - guessStartAtRef.current;
      const trackSeconds = Math.floor(gameSession.currentTrack.durationMs / 1000);
      const replaySeconds = Math.max(
        1,
        Math.min(Math.ceil((elapsedListenMs + elapsedGuessMs) / 1000), trackSeconds)
      );

      setActiveTeam(null);
      setRoundPhase('replay');
      playSnippet(gameSession.currentTrack.id, replaySeconds);

      replayTimeoutRef.current = setTimeout(() => {
        setActiveTeam(otherTeam);
        guessStartAtRef.current = Date.now();
        setRoundPhase('guessing');
      }, replaySeconds * 1000);
    } else {
      resolveRoundFailure();
    }
  };

  const resolveRoundFailure = async () => {
    pause();
    try {
      const updated = await api.failDuelRound(gameSession);
      setGameSession(updated);
      setLastRoundResult({ success: false, card: updated.revealedCard, reason: 'noguess' });
      setActiveTeam(null);
      setRoundPhase('round-result');
    } catch (err) {
      setError('Failed to advance round');
      console.error(err);
    }
  };

  const handlePlaceCard = async (position) => {
    try {
      const updated = await api.placeDuelCard(gameSession, activeTeam, position);
      setGameSession(updated);

      if (updated.placed) {
        setLastRoundResult({ success: true, card: updated.revealedCard, team: activeTeam });
        setRoundPhase(updated.status === 'finished' ? 'game-over' : 'round-result');
      } else {
        setLastRoundResult({ success: false, card: updated.revealedCard, reason: 'placement', team: activeTeam });
        setRoundPhase('round-result');
      }
      pause();
    } catch (err) {
      setError('Failed to place card');
      console.error(err);
    }
  };

  const handleNextRound = () => {
    startRound(gameSession);
  };

  if (loading) {
    return <div className="page game-page no-scroll"><div className="loading">Starting game...</div></div>;
  }

  if (error || playerError) {
    return (
      <div className="page game-page no-scroll">
        <div className="error">{error || playerError}</div>
        <button onClick={onBack} className="btn">Back to Playlists</button>
      </div>
    );
  }

  if (!gameSession) {
    return <div className="page game-page no-scroll"><div className="loading">Loading...</div></div>;
  }

  const isGameOver = gameSession.status === 'finished' || roundPhase === 'game-over';
  const { timeline, currentTrack, scores } = gameSession;
  const elapsedGuessSeconds = roundPhase === 'guessing'
    ? ((Date.now() - guessStartAtRef.current) / 1000).toFixed(1)
    : null;

  const renderPanel = (team) => {
    const isActive = activeTeam === team;
    const status = teamStatus[team];

    return (
      <div className={`duel-panel duel-panel-${team}`}>
        <div className="duel-panel-inner">
          <div className="duel-panel-label">{TEAM_LABEL[team]}</div>

          {roundPhase === 'listening' && (
            <div className="duel-panel-actions">
              <button
                className="btn duel-buzz-btn"
                disabled={status !== 'active' || !deviceReady}
                onClick={() => handleBuzz(team)}
              >
                Guess!
              </button>
              <button
                className="btn btn-secondary duel-skip-btn"
                disabled={status !== 'active'}
                onClick={() => handleSkip(team)}
              >
                Don't know, skip it!
              </button>
            </div>
          )}

          {roundPhase === 'replay' && (
            <div className="duel-waiting">
              Replaying the song for {TEAM_LABEL[Object.keys(teamStatus).find(t => teamStatus[t] === 'active')]}...
            </div>
          )}

          {roundPhase === 'guessing' && !isActive && (
            <div className="duel-waiting">Waiting for {TEAM_LABEL[activeTeam]}...</div>
          )}

          {roundPhase === 'guessing' && isActive && (
            <div className="duel-guess-section">
              <div className="duel-timer">{elapsedGuessSeconds}s</div>
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
                      onClick={() => handleGuessSubmit(team, track)}
                    >
                      <div className="track-info">
                        <div className="track-name">{track.name}</div>
                        <div className="track-artist">{track.artists.join(', ')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button className="btn btn-secondary duel-skip-btn" onClick={() => handleGiveUp(team)}>
                Don't know, skip it!
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="page game-page no-scroll">
      <div className="game-header">
        <button onClick={onBack} className="btn btn-small">← Back</button>
        <h2>{playlist.name} — Duel</h2>
        <div className="duel-score-bar">
          <span className="duel-score-red">Red: {scores.red}</span>
          {' — '}
          <span className="duel-score-blue">Blue: {scores.blue}</span>
          {` (first to ${WIN_SCORE})`}
        </div>
      </div>

      <div className="hitster-content">
        {!isGameOver && ['listening', 'guessing', 'replay'].includes(roundPhase) && (
          <div className="duel-buzzer-area">
            {renderPanel('blue')}
            {renderPanel('red')}
          </div>
        )}

        {!isGameOver && roundPhase === 'placing' && (
          <div className="hitster-current-card">
            <h3>{currentTrack.name}</h3>
            <p className="artists">{currentTrack.artists.join(', ')}</p>
            <p className={`hitster-instructions duel-team-${activeTeam}`}>
              Team {TEAM_LABEL[activeTeam]}, place it on the timeline!
            </p>
          </div>
        )}

        {!isGameOver && roundPhase === 'round-result' && lastRoundResult && (
          <div className="result-section">
            <div className={`result ${lastRoundResult.success ? 'won' : 'lost'}`}>
              {lastRoundResult.success
                ? `🎉 Team ${TEAM_LABEL[lastRoundResult.team]} placed it correctly!`
                : lastRoundResult.reason === 'placement'
                  ? `😢 Team ${TEAM_LABEL[lastRoundResult.team]} placed it wrong!`
                  : "😢 Nobody guessed it!"}
            </div>

            {lastRoundResult.card && (
              <div className="track-reveal">
                <h3>{lastRoundResult.card.name}</h3>
                <p className="artists">{lastRoundResult.card.artists.join(', ')}</p>
                <p className="album">{lastRoundResult.card.releaseYear}</p>
              </div>
            )}

            <div className="result-actions">
              <button onClick={handleNextRound} className="btn btn-primary btn-large">Next Song</button>
            </div>
          </div>
        )}

        {isGameOver && (
          <div className="result-section">
            <div className={`result ${gameSession.winner ? 'won' : ''}`}>
              {gameSession.winner
                ? `🏆 Team ${TEAM_LABEL[gameSession.winner]} wins!`
                : "🤝 It's a draw — no songs left!"}
            </div>

            <div className="stats">
              <p>Final score — Red: {scores.red}, Blue: {scores.blue}</p>
            </div>

            <div className="result-actions">
              <button onClick={handlePlayAgain} className="btn btn-primary btn-large">Play Again</button>
              <button onClick={onBack} className="btn btn-large">Back to Playlists</button>
            </div>
          </div>
        )}

        <div className="timeline-panel">
          <div className="timeline">
            {roundPhase === 'placing' && !isGameOver && (
              <button className="timeline-gap" onClick={() => handlePlaceCard(0)}>+</button>
            )}
            {timeline.map((card, i) => (
              <div key={card.id} className="timeline-track">
                <div className="timeline-card">
                  {card.album.image && <img src={card.album.image} alt={card.name} />}
                  <div className="timeline-year">{card.releaseYear}</div>
                  <div className="timeline-name">{card.name}</div>
                  <div className="timeline-artist">{card.artists.join(', ')}</div>
                </div>
                {roundPhase === 'placing' && !isGameOver && (
                  <button className="timeline-gap" onClick={() => handlePlaceCard(i + 1)}>+</button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
