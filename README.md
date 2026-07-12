# 🎵 Hear-ster

A game where you guess songs from your own Spotify playlists (or liked songs,
saved albums, top tracks, recently played, or followed artists). Three modes:

- **Heardle** — guess the song from a progressively longer audio snippet
- **Hitster** — guess where a song fits on a timeline by release year
- **Hear-ster** — guess the song Heardle-style, then place it on the timeline

Runs as a web app and as a sideloadable Android app (via Capacitor).

## Live deployment

- Web app: https://hearster.onrender.com
- Backend: https://spotifygame-rabv.onrender.com
- Android: debug APK built from `client/android`, distributed directly (not
  on the Play Store) — see [Android app](#android-app) below.

Your Spotify app is in **Development Mode**, which caps access at 25 users.
To let a friend log in, add their Spotify account email in the
[Developer Dashboard](https://developer.spotify.com/dashboard) → your app →
Settings → Users. See [Opening it up wider](#opening-it-up-wider) for lifting
this cap.

## Local Development

### Prerequisites
- Spotify Premium account
- Node.js 18+ and npm
- Spotify Developer account (https://developer.spotify.com/dashboard)

### 1. Spotify Developer Setup

1. Go to https://developer.spotify.com/dashboard
2. Create a new app, accept the terms
3. Copy your **Client ID** and **Client Secret**
4. Add Redirect URI: `http://127.0.0.1:5173/callback`

### 2. Install Dependencies

```bash
npm install
```

This installs dependencies for both `server` and `client` workspaces.

### 3. Configure Environment Variables

```bash
cp server/.env.example server/.env
```

Edit `server/.env`:

```
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
REDIRECT_URI=http://127.0.0.1:5173/callback
```

### 4. Start Development Servers

```bash
npm run dev
```

Starts the Express backend (port 5000) and Vite frontend (port 5173)
concurrently.

Visit **http://127.0.0.1:5173** (not `localhost:5173` — Spotify requires the
loopback IP for redirect URIs) and click "Login with Spotify".

## Production Deployment (Render)

Two separate Render services:

**Backend** — Web Service, root directory `server`.
Env vars: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `CLIENT_URL` (the
static site's URL), `REDIRECT_URI` (`<static site URL>/callback`).

**Frontend** — Static Site, root directory `client`.
Build command: `npm install && npm run build`. Publish directory: `dist`.
Env var: `VITE_API_URL` (the backend's URL).

Render doesn't honor a Netlify-style `_redirects` file — the OAuth flow does
a full-page navigation to `/callback`, which has no matching static file, so
add a rewrite rule in the static site's **Redirects/Rewrites** tab:
Source `/*` → Destination `/index.html` → Action `Rewrite`.

Finally, add `<static site URL>/callback` to the Spotify Dashboard's
Redirect URIs (keep the existing loopback and native-scheme entries too).

The backend free tier spins down after 15 minutes idle; a cron pinger (e.g.
[cron-job.org](https://cron-job.org)) hitting `/health` every ~10 minutes
keeps it warm. The static site doesn't spin down.

## Android App

Built with [Capacitor](https://capacitorjs.com/), wrapping the same web
client in a native shell with an OAuth deep-link redirect
(`spotifyheardle://callback`) instead of a loopback URL.

```bash
cd client
npm run build              # build the web app
npx cap sync android       # copy the build into the Android project
cd android
./gradlew assembleDebug    # or gradlew.bat on Windows
```

The debug APK is at
`client/android/app/build/outputs/apk/debug/app-debug.apk`. It's built
against whatever `VITE_API_URL` is set to in `client/.env` at build time
(currently the production backend), so a freshly built APK works
out of the box for anyone you send it to — they just need to enable
"install unknown apps" and be added as a user in the Developer Dashboard.

To change the app icon or splash screen, replace `client/assets/icon.png`
and rerun `npx @capacitor/assets generate --android` before syncing.

## File Structure

```
/server
  /src
    /routes
      auth.js      - Spotify OAuth (PKCE) flow: login, callback, refresh
      playlists.js - Playlist/library track sources (playlists, liked
                      songs, saved albums, top tracks, recently played,
                      followed artists)
      game.js       - Game logic for all three modes
    index.js        - Express server entry

/client
  /src
    /pages          - LoginPage, PlaylistPicker, ModeSelect, HeardleGame,
                       HitsterGame, HearsterGame
    /hooks           - useAuth (token storage/refresh),
                        useSpotifyPlayer (Web Playback SDK)
    api.js           - API client for backend communication
    App.jsx          - Main app component / page routing
    style.css        - Styling
  index.html          - HTML entry point
  vite.config.js      - Vite configuration
  /android            - Capacitor Android project
  /assets             - Source icon for Capacitor asset generation
```

## Game Rules

**Heardle**: pick a playlist, listen to progressively longer snippets
(1s → 2s → 4s → 7s → 11s → 16s), guess the song from the playlist's own
tracklist. 6 attempts.

**Hitster**: pick a playlist, hear a full track, and place it on a timeline
by release year relative to previously placed cards. One wrong placement
ends the game.

**Hear-ster**: guess the song Heardle-style first, then place the revealed
track on the timeline. Combines both.

## Troubleshooting

### "Spotify Premium required"
Free accounts can log in but can't stream via the Web Playback SDK.

### Login redirect fails / "redirect_uri: Not matching configuration"
The redirect URI used by the login request must exactly match an entry in
the Spotify Dashboard's Redirect URIs (scheme, host, path, trailing slash —
all of it). Check `REDIRECT_URI` (web) / the native scheme (Android)
against what's actually registered.

### No playlists show up
Your account needs at least one playlist. Create one in Spotify and try
again.

### Audio doesn't play
- Check the browser/WebView console for errors
- Ensure your device isn't already playing on another Spotify app — the Web
  Playback SDK can only control one device at a time
- A one-off `authentication_error`/`initialization_error` from the SDK
  right after app launch is expected occasionally (the SDK's own connection
  handshake is flaky); the app retries automatically with backoff before
  surfacing an error

### Large playlists fail to load or start a game
Spotify playlists cap out at 10,000 tracks; the app paginates through all
of them. If you still hit an error, it's likely unrelated — check the
server logs.

## Technologies

- **Frontend**: React 18 + Vite
- **Backend**: Node.js + Express
- **Mobile**: Capacitor (Android)
- **Audio**: Spotify Web Playback SDK
- **API**: Spotify Web API
- **Hosting**: Render (backend Web Service + frontend Static Site)

Game sessions are held client-side and passed back to the server on each
request; there's no database and no persistent scores/leaderboard yet.

## Opening it up wider

Currently gated by Spotify's Development Mode (25-user cap) and
Android-only distribution. Not yet started.

## License

Personal project for learning and entertainment.
