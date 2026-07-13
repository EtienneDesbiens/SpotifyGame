import { useState, useEffect, useRef } from 'react';
import { api } from '../api';

const OTHER_TEAM = { red: 'blue', blue: 'red' };
const TEAM_LABEL = { red: 'Red', blue: 'Blue' };
const DEFAULT_WIN_SCORE = 5;
const WIN_SCORE_OPTIONS = [3, 5, 7, 10];

export function DuelGame({ playlist, onBack, spotifyPlayer }) {
  const { deviceReady, error: playerError, playSnippet, playFullTrack, pause } = spotifyPlayer;

  const [gameSession, setGameSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [winScoreChoice, setWinScoreChoice] = useState(DEFAULT_WIN_SCORE);

  const [roundPhase, setRoundPhase] = useState('listening');
  const [teamStatus, setTeamStatus] = useState({ red: 'active', blue: 'active' });
  const [activeTeam, setActiveTeam] = useState(null);
  const [lastRoundResult, setLastRoundResult] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [filteredTracks, setFilteredTracks] = useState([]);
  const [guessElapsedMs, setGuessElapsedMs] = useState(0);
  // Whether the currently-listening team is in a bounded "catch up" window
  // (after the other team failed), as opposed to the initial open-ended
  // listen. Drives the countdown display of how much bonus listening time
  // is left.
  const [inCatchup, setInCatchup] = useState(false);
  const [catchupRemainingMs, setCatchupRemainingMs] = useState(0);

  const guessStartAtRef = useRef(0);
  // Tracks how far into the track playback has reached (ms), and the wall-clock
  // time the current playback segment started, so a team's failed guess can
  // resume the song from exactly where the previous team buzzed in rather than
  // restarting it from 0.
  const trackPositionRef = useRef(0);
  const segmentStartAtRef = useRef(0);
  // How long the current playback segment is allowed to run before it's
  // capped (Infinity during the open-ended initial listen, bounded to the
  // catch-up window otherwise) — used so a team buzzing in long after a
  // catch-up snippet already auto-paused doesn't get credited with extra
  // track position they never actually heard.
  const segmentDurationCapRef = useRef(Infinity);
  const catchupStartAtRef = useRef(0);
  const catchupDurationMsRef = useRef(0);
  const timerIntervalRef = useRef(null);

  useEffect(() => {
    return () => {
      pause();
      clearInterval(timerIntervalRef.current);
    };
  }, [playlist]);

  // Keyed on activeTeam (not just roundPhase) so the countdown reliably
  // restarts for the second team's guessing turn — roundPhase alone toggles
  // 'guessing' -> 'listening' -> 'guessing' between turns, but relying only
  // on that string was fragile; activeTeam changing is the real signal that
  // a new turn's timer should start from zero.
  useEffect(() => {
    if (roundPhase !== 'guessing' || !activeTeam) return;
    setGuessElapsedMs(0);
    timerIntervalRef.current = setInterval(() => {
      setGuessElapsedMs(Date.now() - guessStartAtRef.current);
    }, 100);
    return () => clearInterval(timerIntervalRef.current);
  }, [roundPhase, activeTeam]);

  useEffect(() => {
    if (!inCatchup) return;
    const tick = () => {
      setCatchupRemainingMs(Math.max(0, catchupDurationMsRef.current - (Date.now() - catchupStartAtRef.current)));
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [inCatchup]);

  const startGame = async (winScore) => {
    try {
      setLoading(true);
      setError(null);
      const session = await api.startDuelGame(playlist.id, playlist.tracks, winScore);
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
    setTeamStatus({ red: 'active', blue: 'active' });
    setActiveTeam(null);
    setLastRoundResult(null);
    setSearchInput('');
    setFilteredTracks([]);
    setRoundPhase('listening');
    setInCatchup(false);
    trackPositionRef.current = 0;
    segmentStartAtRef.current = Date.now();
    segmentDurationCapRef.current = Infinity;
    playFullTrack(session.currentTrack.id, 0);
  };

  const handlePlayAgain = () => {
    startGame(gameSession.winScore);
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
    const elapsedSincePlayStart = Date.now() - segmentStartAtRef.current;
    trackPositionRef.current += Math.min(elapsedSincePlayStart, segmentDurationCapRef.current);
    setInCatchup(false);
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
      // The other team gets a bonus "catch up" listen — resuming exactly
      // where this team buzzed in, bounded to how long this team's guess
      // timer ran — and can buzz in or skip at any point during it.
      const catchupMs = Math.max(1000, Date.now() - guessStartAtRef.current);
      const catchupSeconds = Math.ceil(catchupMs / 1000);

      setActiveTeam(null);
      setRoundPhase('listening');

      const durationMs = gameSession.currentTrack.durationMs;
      const resumeMs = Math.min(trackPositionRef.current, Math.max(0, durationMs - 1000));

      segmentStartAtRef.current = Date.now();
      segmentDurationCapRef.current = catchupSeconds * 1000;
      catchupStartAtRef.current = Date.now();
      catchupDurationMsRef.current = catchupSeconds * 1000;
      setCatchupRemainingMs(catchupSeconds * 1000);
      setInCatchup(true);

      playSnippet(gameSession.currentTrack.id, catchupSeconds, resumeMs);
    } else {
      resolveRoundFailure();
    }
  };

  const resolveRoundFailure = async () => {
    setInCatchup(false);
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
    return (
      <div className="page game-page">
        <div className="game-header">
          <button onClick={onBack} className="btn btn-small">← Back</button>
          <h2>{playlist.name} — Duel</h2>
        </div>

        <div className="duel-setup">
          <h3>How many points to win?</h3>
          <div className="duel-winscore-options">
            {WIN_SCORE_OPTIONS.map(n => (
              <button
                key={n}
                className={`btn ${winScoreChoice === n ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setWinScoreChoice(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <label className="duel-winscore-custom">
            Custom
            <input
              type="number"
              min="1"
              max="50"
              value={winScoreChoice}
              onChange={e => setWinScoreChoice(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
              className="search-input"
            />
          </label>
          <button className="btn btn-primary btn-large" onClick={() => startGame(winScoreChoice)}>
            Start Duel
          </button>
        </div>
      </div>
    );
  }

  const isGameOver = gameSession.status === 'finished' || roundPhase === 'game-over';
  const { timeline, currentTrack, scores } = gameSession;
  const elapsedGuessSeconds = roundPhase === 'guessing'
    ? (guessElapsedMs / 1000).toFixed(1)
    : null;

  const renderPanel = (team) => {
    const isActive = activeTeam === team;
    const status = teamStatus[team];

    return (
      <div className={`duel-panel duel-panel-${team}`}>
        <div className="duel-panel-inner">
          <div className="duel-panel-label">{TEAM_LABEL[team]}</div>

          {roundPhase === 'listening' && status === 'active' && (
            <div className="duel-panel-actions">
              {inCatchup && (
                <div className="duel-timer">{(catchupRemainingMs / 1000).toFixed(1)}s of song left</div>
              )}
              <button
                className="btn duel-buzz-btn"
                disabled={!deviceReady}
                onClick={() => handleBuzz(team)}
              >
                Guess!
              </button>
              <button
                className="btn btn-secondary duel-skip-btn"
                onClick={() => handleSkip(team)}
              >
                Don't know, skip it!
              </button>
            </div>
          )}

          {roundPhase === 'listening' && status === 'failed' && (
            <div className="duel-waiting">Out for this round — the song has resumed for the other team.</div>
          )}

          {roundPhase === 'listening' && status === 'skipped' && (
            <div className="duel-waiting">Skipped — waiting on the other team.</div>
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
          {` (first to ${gameSession.winScore})`}
        </div>
      </div>

      <div className="hitster-content">
        {!isGameOver && ['listening', 'guessing'].includes(roundPhase) && (
          <div className="duel-buzzer-area">
            {renderPanel('red')}
            {renderPanel('blue')}
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

        {!isGameOver && roundPhase === 'placing' && (
          <div className="timeline-panel">
            <div className="timeline">
              <button className="timeline-gap" onClick={() => handlePlaceCard(0)}>+</button>
              {timeline.map((card, i) => (
                <div key={card.id} className="timeline-track">
                  <div className="timeline-card">
                    {card.album.image && <img src={card.album.image} alt={card.name} />}
                    <div className="timeline-year">{card.releaseYear}</div>
                    <div className="timeline-name">{card.name}</div>
                    <div className="timeline-artist">{card.artists.join(', ')}</div>
                  </div>
                  <button className="timeline-gap" onClick={() => handlePlaceCard(i + 1)}>+</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
