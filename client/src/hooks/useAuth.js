import { useState, useEffect, useRef } from 'react';
import { api } from '../api';

export function useAuth() {
  const [accessToken, setAccessToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [user, setUser] = useState(null);
  const refreshTimerRef = useRef(null);

  useEffect(() => {
    const stored = {
      accessToken: localStorage.getItem('accessToken'),
      refreshToken: localStorage.getItem('refreshToken'),
      user: localStorage.getItem('user'),
      expiresAt: localStorage.getItem('expiresAt')
    };

    if (stored.accessToken) {
      setAccessToken(stored.accessToken);
      setRefreshToken(stored.refreshToken);
      if (stored.user) {
        setUser(JSON.parse(stored.user));
      }
      scheduleRefresh(stored.refreshToken, stored.expiresAt ? Number(stored.expiresAt) : Date.now());
    }

    return () => clearTimeout(refreshTimerRef.current);
  }, []);

  const scheduleRefresh = (refresh, expiresAt) => {
    clearTimeout(refreshTimerRef.current);
    if (!refresh) return;

    // Refresh 60s before actual expiry; if already expired/near-expiry, refresh immediately.
    const delay = Math.max(expiresAt - Date.now() - 60_000, 0);
    refreshTimerRef.current = setTimeout(() => doRefresh(refresh), delay);
  };

  const doRefresh = async (refresh) => {
    try {
      const { accessToken: newAccessToken, expiresIn } = await api.refreshAccessToken(refresh);
      const expiresAt = Date.now() + expiresIn * 1000;
      localStorage.setItem('accessToken', newAccessToken);
      localStorage.setItem('expiresAt', String(expiresAt));
      setAccessToken(newAccessToken);
      scheduleRefresh(refresh, expiresAt);
    } catch (err) {
      console.error('Failed to refresh access token', err);
    }
  };

  const saveTokens = (access, refresh, userData, expiresIn) => {
    const expiresAt = Date.now() + (expiresIn ?? 3600) * 1000;
    localStorage.setItem('accessToken', access);
    localStorage.setItem('refreshToken', refresh);
    localStorage.setItem('expiresAt', String(expiresAt));
    if (userData) {
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
    }
    setAccessToken(access);
    setRefreshToken(refresh);
    scheduleRefresh(refresh, expiresAt);
  };

  const clearTokens = () => {
    clearTimeout(refreshTimerRef.current);
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('expiresAt');
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
  };

  return { accessToken, refreshToken, user, saveTokens, clearTokens };
}
