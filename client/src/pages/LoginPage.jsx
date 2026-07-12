import { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { api } from '../api';

const isNative = Capacitor.isNativePlatform();
const REDIRECT_URI = isNative ? 'spotifyheardle://callback' : 'http://127.0.0.1:5173/callback';

export function LoginPage({ onLoginSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const hasHandledCallbackRef = useRef(false);

  useEffect(() => {
    if (isNative) {
      // The native app's OAuth redirect isn't a real HTTP address — Spotify
      // redirects to the custom URL scheme registered in AndroidManifest.xml,
      // and the OS hands that URL back to the app via this listener instead
      // of a page navigation.
      const listener = App.addListener('appUrlOpen', ({ url }) => {
        Browser.close().catch(() => {});
        const code = new URL(url).searchParams.get('code');
        if (code && !hasHandledCallbackRef.current) {
          hasHandledCallbackRef.current = true;
          handleCallback(code);
        }
      });
      return () => { listener.then(l => l.remove()); };
    }

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    // Guards against React StrictMode's double-invocation of effects in dev,
    // which would otherwise exchange the (single-use) authorization code twice.
    if (code && !hasHandledCallbackRef.current) {
      hasHandledCallbackRef.current = true;
      handleCallback(code);
    }
  }, []);

  // Cold-start retries against a sleeping free-tier backend are handled
  // transparently by the shared axios instance in api.js.
  const handleCallback = async (code) => {
    const stored = sessionStorage.getItem('codeVerifier');
    if (!stored) {
      setError('Session expired. Please try logging in again.');
      return;
    }

    try {
      setLoading(true);
      const { accessToken, refreshToken, expiresIn } = await api.exchangeCode(code, stored, REDIRECT_URI);
      const user = await api.fetchUserProfile(accessToken);
      onLoginSuccess(accessToken, refreshToken, user, expiresIn);
      sessionStorage.removeItem('codeVerifier');
      if (!isNative) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to log in. Please try again.');
      sessionStorage.removeItem('codeVerifier');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    try {
      setLoading(true);
      setError(null);
      const { url, codeVerifier } = await api.getLoginUrl(REDIRECT_URI);
      sessionStorage.setItem('codeVerifier', codeVerifier);

      if (isNative) {
        await Browser.open({ url });
        setLoading(false);
      } else {
        window.location.href = url;
      }
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
