import { useState, useEffect, useRef } from 'react';
import { api } from '../api';

export function LoginPage({ onLoginSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const hasHandledCallbackRef = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    // Guards against React StrictMode's double-invocation of effects in dev,
    // which would otherwise exchange the (single-use) authorization code twice.
    if (code && !hasHandledCallbackRef.current) {
      hasHandledCallbackRef.current = true;
      handleCallback(code);
    }
  }, []);

  const handleCallback = async (code) => {
    const stored = sessionStorage.getItem('codeVerifier');
    if (!stored) {
      setError('Session expired. Please try logging in again.');
      return;
    }

    try {
      setLoading(true);
      const { accessToken, refreshToken, expiresIn } = await api.exchangeCode(code, stored);
      const user = await api.fetchUserProfile(accessToken);
      onLoginSuccess(accessToken, refreshToken, user, expiresIn);
      sessionStorage.removeItem('codeVerifier');
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to log in');
      sessionStorage.removeItem('codeVerifier');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    try {
      setLoading(true);
      setError(null);
      const { url, codeVerifier } = await api.getLoginUrl();
      sessionStorage.setItem('codeVerifier', codeVerifier);
      window.location.href = url;
    } catch (err) {
      setError('Failed to start login');
      setLoading(false);
    }
  };

  return (
    <div className="page login-page">
      <div className="login-container">
        <h1>🎵 Spotify Heardle</h1>
        <p>Guess the song from your Spotify playlists</p>

        {error && <div className="error">{error}</div>}

        <button
          onClick={handleLogin}
          disabled={loading}
          className="btn btn-primary btn-large"
        >
          {loading ? 'Logging in...' : 'Login with Spotify'}
        </button>

        <div className="login-note">
          <p>You must have Spotify Premium to play</p>
        </div>
      </div>
    </div>
  );
}
