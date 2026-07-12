import { useState, useEffect } from 'react';
import { api } from '../api';

export function PlaylistPicker({ accessToken, onSelectPlaylist, onLogout, user }) {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchPlaylists();
  }, [accessToken]);

  const fetchPlaylists = async () => {
    try {
      setLoading(true);
      const data = await api.fetchPlaylists(accessToken);
      setPlaylists(data);
    } catch (err) {
      setError('Failed to load playlists');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePlaylistClick = async (playlist) => {
    try {
      setLoading(true);
      setError(null);
      const { tracks } = await api.fetchPlaylistTracks(accessToken, playlist.id);
      onSelectPlaylist({ ...playlist, tracks });
    } catch (err) {
      if (err.response?.status === 403) {
        setError("Spotify only allows this app to read tracks from playlists you personally created. Try a different playlist.");
      } else {
        setError('Failed to load playlist tracks');
      }
      console.error(err);
      setLoading(false);
    }
  };

  const specialPlaylists = [
    { id: 'liked-songs', name: 'Liked Songs', icon: '♥' },
    { id: 'saved-albums', name: 'Saved Albums', icon: '💿' },
    { id: 'top-tracks', name: 'Your Top Tracks', icon: '🔥' },
    { id: 'recently-played', name: 'Recently Played', icon: '🕐' },
    { id: 'followed-artists', name: "Followed Artists' Top Tracks", icon: '🎤' }
  ];

  return (
    <div className="page playlist-picker-page">
      <div className="header">
        <h1>🎵 Spotify Heardle</h1>
        <div className="user-section">
          {user && <span className="user-name">Welcome, {user.display_name}</span>}
          <button onClick={onLogout} className="btn btn-small">Logout</button>
        </div>
      </div>

      <div className="content">
        <h2>Pick a playlist to play</h2>

        {error && <div className="error">{error}</div>}

        {loading && <div className="loading">Loading playlists...</div>}

        {!loading && (
          <div className="playlists-grid">
            {specialPlaylists.map(special => (
              <div
                key={special.id}
                className="playlist-card"
                onClick={() => handlePlaylistClick(special)}
              >
                <div className="special-source-icon">{special.icon}</div>
                <h3>{special.name}</h3>
              </div>
            ))}

            {playlists.map(playlist => (
              <div
                key={playlist.id}
                className="playlist-card"
                onClick={() => handlePlaylistClick(playlist)}
              >
                {playlist.images?.[0] && (
                  <img src={playlist.images[0].url} alt={playlist.name} />
                )}
                <h3>{playlist.name}</h3>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
