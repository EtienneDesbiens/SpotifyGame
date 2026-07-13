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

    // Spotify's Web Playback SDK connection handshake fails transiently and
    // spuriously with authentication_error/initialization_error even with a
    // valid, unexpired Premium token (a known SDK flakiness) — reconnecting
    // resolves it, which is why restarting the app "fixes" it. Retry a few
    // times with backoff before giving up and surfacing an error.
    const CONNECT_RETRY_DELAYS_MS = [1000, 2000, 4000];
    let connectRetryCount = 0;

    const createPlayer = () => {
      const player = new window.Spotify.Player({
        name: playerNameRef.current,
        getOAuthToken: callback => callback(accessTokenRef.current),
        volume: 0.5
      });

      player.addListener('ready', async ({ device_id }) => {
        connectRetryCount = 0;

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

      const retryConnect = (logLabel, message, onGiveUp) => {
        console.error(logLabel, message);
        if (connectRetryCount >= CONNECT_RETRY_DELAYS_MS.length) {
          onGiveUp();
          return;
        }
        const delay = CONNECT_RETRY_DELAYS_MS[connectRetryCount];
        connectRetryCount += 1;
        setTimeout(() => player.connect(), delay);
      };

      player.addListener('initialization_error', ({ message }) => {
        retryConnect('Spotify player initialization error:', message, () =>
          setError('Failed to initialize Spotify player: ' + message));
      });

      player.addListener('authentication_error', ({ message }) => {
        retryConnect('Spotify player authentication error:', message, () =>
          setError('Spotify authentication failed: ' + message));
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

  // Spotify's Connect API rejects playback commands issued in quick
  // succession with 403 "Restriction violated" — this game's play-then-
  // auto-pause pattern triggers it often, and the restriction window can
  // last several seconds (longer on mobile than what a couple of short
  // retries could absorb). Two defenses: proactively space commands at
  // least MIN_COMMAND_GAP_MS apart, and retry with a generous backoff if a
  // 403 happens anyway.
  const MIN_COMMAND_GAP_MS = 1200;
  const RESTRICTION_RETRY_DELAYS_MS = [1500, 3000, 5000];
  const lastCommandAtRef = useRef(0);

  const sendPlayCommand = async (trackId, positionMs = 0) => {
    const trackUri = `spotify:track:${trackId}`;

    for (let attempt = 0; ; attempt++) {
      const wait = MIN_COMMAND_GAP_MS - (Date.now() - lastCommandAtRef.current);
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      lastCommandAtRef.current = Date.now();

      const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessTokenRef.current}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ uris: [trackUri], position_ms: positionMs })
      });

      if (response.ok) return response;

      const body = await response.json().catch(() => null);
      const isRestrictionViolation = response.status === 403;
      if (!isRestrictionViolation || attempt >= RESTRICTION_RETRY_DELAYS_MS.length) {
        console.error('Spotify play command failed:', response.status, body);
        throw Object.assign(new Error(body?.error?.message || 'Unknown error'), { status: response.status });
      }

      await new Promise(r => setTimeout(r, RESTRICTION_RETRY_DELAYS_MS[attempt]));
    }
  };

  const sendPauseCommand = async () => {
    const wait = MIN_COMMAND_GAP_MS - (Date.now() - lastCommandAtRef.current);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastCommandAtRef.current = Date.now();

    return fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${deviceIdRef.current}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessTokenRef.current}` }
    });
  };

  const playSnippet = async (trackId, snippetLength, positionMs = 0) => {
    if (!trackId || !snippetLength || !deviceIdRef.current) return;

    // Cancel any pending auto-pause from a previous (now-stale) snippet play,
    // otherwise it fires on its original schedule and cuts this one off early.
    clearTimeout(pauseTimeoutRef.current);

    try {
      await sendPlayCommand(trackId, positionMs);

      pauseTimeoutRef.current = setTimeout(() => {
        sendPauseCommand().catch(err => console.error('Failed to pause snippet', err));
      }, snippetLength * 1000);
    } catch (err) {
      console.error('Failed to play snippet', err);
      setError(`Playback failed${err.status ? ` (${err.status})` : ''}: ${err.message}`);
    }
  };

  const playFullTrack = async (trackId, positionMs = 0) => {
    if (!trackId || !deviceIdRef.current) return;

    // A pending snippet auto-pause must not cut off full-track playback
    // (e.g. on the game-over reveal) once it eventually fires.
    clearTimeout(pauseTimeoutRef.current);

    try {
      await sendPlayCommand(trackId, positionMs);
    } catch (err) {
      console.error('Failed to play full track', err);
    }
  };

  const pause = () => {
    clearTimeout(pauseTimeoutRef.current);
    if (!deviceIdRef.current) return;
    sendPauseCommand().catch(err => console.error('Failed to pause', err));
  };

  return { deviceReady, isPlaying, error, setError, playSnippet, playFullTrack, pause };
}
