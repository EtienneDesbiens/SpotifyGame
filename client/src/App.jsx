import { useState, useEffect } from 'react';
import { LoginPage } from './pages/LoginPage';
import { PlaylistPicker } from './pages/PlaylistPicker';
import { ModeSelect } from './pages/ModeSelect';
import { HeardleGame } from './pages/HeardleGame';
import { HitsterGame } from './pages/HitsterGame';
import { HearsterGame } from './pages/HearsterGame';
import { useAuth } from './hooks/useAuth';
import { useSpotifyPlayer } from './hooks/useSpotifyPlayer';

export default function App() {
  const { accessToken, refreshToken, user, saveTokens, clearTokens } = useAuth();
  const spotifyPlayer = useSpotifyPlayer(accessToken);
  const [currentPage, setCurrentPage] = useState('login');
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);

  useEffect(() => {
    if (accessToken && user) {
      setCurrentPage('playlist-picker');
    } else if (!accessToken) {
      setCurrentPage('login');
    }
  }, [accessToken, user]);

  const handlePlaylistSelect = (playlist) => {
    setSelectedPlaylist(playlist);
    setCurrentPage('mode-select');
  };

  const handleModeSelect = (mode) => {
    if (mode === 'hitster') {
      setCurrentPage('hitster-game');
    } else if (mode === 'hearster') {
      setCurrentPage('hearster-game');
    } else {
      setCurrentPage('heardle-game');
    }
  };

  const handleBackToPlaylists = () => {
    setSelectedPlaylist(null);
    setCurrentPage('playlist-picker');
  };

  const handleBackToModeSelect = () => {
    setCurrentPage('mode-select');
  };

  const handleLogout = () => {
    clearTokens();
    setCurrentPage('login');
  };

  return (
    <div className="app">
      {currentPage === 'login' && <LoginPage onLoginSuccess={saveTokens} />}
      {currentPage === 'playlist-picker' && (
        <PlaylistPicker
          accessToken={accessToken}
          onSelectPlaylist={handlePlaylistSelect}
          onLogout={handleLogout}
          user={user}
        />
      )}
      {currentPage === 'mode-select' && selectedPlaylist && (
        <ModeSelect
          playlist={selectedPlaylist}
          onSelectMode={handleModeSelect}
          onBack={handleBackToPlaylists}
        />
      )}
      {currentPage === 'heardle-game' && selectedPlaylist && (
        <HeardleGame
          playlist={selectedPlaylist}
          onBack={handleBackToModeSelect}
          spotifyPlayer={spotifyPlayer}
        />
      )}
      {currentPage === 'hitster-game' && selectedPlaylist && (
        <HitsterGame
          playlist={selectedPlaylist}
          onBack={handleBackToModeSelect}
          spotifyPlayer={spotifyPlayer}
        />
      )}
      {currentPage === 'hearster-game' && selectedPlaylist && (
        <HearsterGame
          playlist={selectedPlaylist}
          onBack={handleBackToModeSelect}
          spotifyPlayer={spotifyPlayer}
        />
      )}
    </div>
  );
}
