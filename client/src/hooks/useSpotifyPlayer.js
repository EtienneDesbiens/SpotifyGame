import { useState, useEffect, useRef } from 'react';

// Owns a single Spotify Web Playback SDK connection for the entire session.
// Creating a second Player instance within the same page load is unreliable
// (the SDK doesn't cleanly support sequential instances), so this must be
// used once at the top of the app and its interface passed down, rather than
// re-created every time a new game round starts.
export function useSpotifyPlayer(accessToken) {
  const [deviceReady, setDeviceReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState(null);
  const playerRef = useRef(null);
  const deviceIdRef = useRef(null);
  const accessTokenRef = useRef(accessToken);
  const playerNameRef = useRef(`Spotify Heardle (${Math.random().toString(36).slice(2, 8)})`);
  const hasInitializedRef = useRef(false);
  const pauseTimeoutRef = useRef(null);

  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  // Initializes the player once, the first time a real access token shows up.
  // Deliberately does not return a cleanup tied to accessToken changes (e.g.
  // token refresh) — only the mount-only effect below tears the player down.
  useEffect(() => {
    if (!accessToken || hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const createPlayer = () => {
      const player = new window.Spotify.Player({
        name: playerNameRef.current,
        getOAuthToken: callback => callback(accessTokenRef.current),
        volume: 0.5
      });

      player.addListener('ready', async ({ device_id }) => {
        // The SDK's locally-reported device_id doesn't reliably match what the
        // REST API accepts as a valid device_id right away. Instead, look up
        // our device by its (session-unique) name in the authoritative
        // devices list and use the ID Spotify's server actually reports.
        try {
          let resolvedId = null;
          for (let attempt = 0; attempt < 10 && !resolvedId; attempt++) {
            const res = await fetch('https://api.spotify.com/v1/me/player/devices', {
              headers: { Authorization: `Bearer ${accessTokenRef.current}` }
            });
            if (res.ok) {
              const { devices } = await res.json();
              const match = devices.find(d => d.name === playerNameRef.current);
              if (match) resolvedId = match.id;
            }
            if (!resolvedId) await new Promise(r => setTimeout(r, 500));
          }

          if (!resolvedId) {
            setError('Could not find the Spotify player device. Please refresh and try again.');
            return;
          }

          deviceIdRef.current = resolvedId;

          const response = await fetch('https://api.spotify.com/v1/me/player', {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${accessTokenRef.current}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ device_ids: [resolvedId], play: false })
          });

          if (!response.ok) {
            const body = await response.json().catch(() => null);
            console.error('Transfer playback failed:', response.status, body);
            setError(`Failed to activate Spotify device (${response.status}): ${body?.error?.message || 'Unknown error'}`);
            return;
          }
        } catch (err) {
          console.error('Failed to activate Spotify device', err);
          setError('Failed to activate Spotify device');
          return;
        }

        setDeviceReady(true);
      });

      player.addListener('not_ready', ({ device_id }) => {
        console.warn('Spotify device went not_ready:', device_id);
        setDeviceReady(false);
      });

      player.addListener('player_state_changed', state => {
        if (state) {
          setIsPlaying(state.paused === false);
        }
      });

      player.addListener('initialization_error', ({ message }) => {
        console.error('Spotify player initialization error:', message);
        setError('Failed to initialize Spotify player: ' + message);
      });

      player.addListener('authentication_error', ({ message }) => {
        console.error('Spotify player authentication error:', message);
        setError('Spotify authentication failed: ' + message);
      });

      player.addListener('account_error', ({ message }) => {
        console.error('Spotify player account error:', message);
        setError('This game requires Spotify Premium: ' + message);
      });

      player.connect();
      playerRef.current = player;
    };

    // The SDK's <script> tag fires window.onSpotifyWebPlaybackSDKReady exactly
    // once, whenever it finishes loading (which usually happens on initial page
    // load, before this hook ever runs). If window.Spotify already exists,
    // that callback already fired and we must create the player directly
    // instead of waiting for a callback that will never come again.
    if (window.Spotify) {
      createPlayer();
    } else {
      window.onSpotifyWebPlaybackSDKReady = createPlayer;
    }
  }, [accessToken]);

  // Tears the connection down only on true unmount (app close/navigation
  // away), not on every re-render or token refresh.
  useEffect(() => {
    return () => {
      playerRef.current?.disconnect();
    };
  }, []);

  const playSnippet = async (trackId, snippetLength) => {
    if (!trackId || !snippetLength || !deviceIdRef.current) return;

    // Cancel any pending auto-pause from a previous (now-stale) snippet play,
    // otherwise it fires on its original schedule and cuts this one off early.
    clearTimeout(pauseTimeoutRef.current);

    try {
      const trackUri = `spotify:track:${trackId}`;
      const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessTokenRef.current}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ uris: [trackUri], position_ms: 0 })
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        console.error('Spotify play command failed:', response.status, body);
        setError(`Playback failed (${response.status}): ${body?.error?.message || 'Unknown error'}`);
        return;
      }

      pauseTimeoutRef.current = setTimeout(() => {
        fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${deviceIdRef.current}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${accessTokenRef.current}` }
        }).catch(err => console.error('Failed to pause snippet', err));
      }, snippetLength * 1000);
    } catch (err) {
      console.error('Failed to play snippet', err);
      setError('Failed to play snippet');
    }
  };

  const playFullTrack = async (trackId) => {
    if (!trackId || !deviceIdRef.current) return;

    // A pending snippet auto-pause must not cut off full-track playback
    // (e.g. on the game-over reveal) once it eventually fires.
    clearTimeout(pauseTimeoutRef.current);

    try {
      const trackUri = `spotify:track:${trackId}`;
      const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessTokenRef.current}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ uris: [trackUri], position_ms: 0 })
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        console.error('Full track playback failed:', response.status, body);
      }
    } catch (err) {
      console.error('Failed to play full track', err);
    }
  };

  const pause = () => {
    clearTimeout(pauseTimeoutRef.current);
    if (!deviceIdRef.current) return;
    fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${deviceIdRef.current}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessTokenRef.current}` }
    }).catch(err => console.error('Failed to pause', err));
  };

  return { deviceReady, isPlaying, error, setError, playSnippet, playFullTrack, pause };
}
