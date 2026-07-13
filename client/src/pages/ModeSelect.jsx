export function ModeSelect({ playlist, onSelectMode, onBack }) {
  return (
    <div className="page mode-select-page">
      <div className="header">
        <button onClick={onBack} className="btn btn-small">← Back</button>
        <h2>{playlist.name}</h2>
      </div>

      <div className="content">
        <h2>Choose a game mode</h2>

        <div className="mode-grid">
          <div className="mode-card" onClick={() => onSelectMode('heardle')}>
            <div className="mode-icon">🎧</div>
            <h3>Heardle</h3>
            <p>Guess the song from a progressively longer audio clip.</p>
          </div>

          <div className="mode-card" onClick={() => onSelectMode('hitster')}>
            <div className="mode-icon">📅</div>
            <h3>Hitster</h3>
            <p>Build a timeline by placing each song in the right chronological spot.</p>
          </div>

          <div className="mode-card" onClick={() => onSelectMode('hearster')}>
            <div className="mode-icon">🎯</div>
            <h3>Hear-ster</h3>
            <p>Guess the song Heardle-style, then place it on the timeline.</p>
          </div>

          <div className="mode-card" onClick={() => onSelectMode('duel')}>
            <div className="mode-icon">⚔️</div>
            <h3>Duel</h3>
            <p>Two teams race to buzz in, guess, and place songs on the timeline. First to 5 points wins.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
