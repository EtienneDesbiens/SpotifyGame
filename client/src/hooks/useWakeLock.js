import { useEffect } from 'react';

// Keeps the screen awake for as long as the app is open, using the standard
// Screen Wake Lock API. The lock is released by the OS whenever the tab/app
// is backgrounded, so it's re-requested on visibility regain (e.g. switching
// back from another app on Android).
export function useWakeLock() {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;

    let wakeLock = null;

    const requestWakeLock = async () => {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
      } catch (err) {
        console.error('Failed to acquire wake lock', err);
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      wakeLock?.release().catch(() => {});
    };
  }, []);
}
