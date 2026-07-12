# 🎵 Spotify Heardle

A web game where you guess songs from your own Spotify playlists. Start with audio snippets (Heardle), then add artist/year guessing (Hitster), and finally combine both in a unified mode.

## Quick Start

### Prerequisites
- Spotify Premium account
- Node.js 18+ and npm
- Spotify Developer account (https://developer.spotify.com/dashboard)

### 1. Spotify Developer Setup

1. Go to https://developer.spotify.com/dashboard
2. Create a new app
3. Accept the terms and create the app
4. Copy your **Client ID** and **Client Secret**
5. Go to app settings and add Redirect URI: `http://127.0.0.1:5173/callback`

### 2. Install Dependencies

```bash
npm install
```

This installs dependencies for both `server` and `client` workspaces.

### 3. Configure Environment Variables

Create a `.env` file in the `server` directory:

```bash
cp server/.env.example server/.env
```

Edit `server/.env` and add your Spotify credentials:

```
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
REDIRECT_URI=http://127.0.0.1:5173/callback
```

### 4. Start Development Servers

```bash
npm run dev
```

This starts both the Express backend (port 5000) and Vite frontend (port 5173) concurrently.

Visit **http://127.0.0.1:5173** in your browser (not `localhost:5173` — Spotify requires the loopback IP for redirect URIs, and using a different hostname will break the login flow) and click "Login with Spotify".

## Important Notes

### Spotify Premium Requirement
The Web Playback SDK requires Spotify Premium on every account that plays. Free accounts can log in but cannot stream via the SDK.

### Developer Mode Limitations
Your Spotify app starts in Development Mode with these limits:
- **Max 25 users**: You must manually add each friend's Spotify account email in the Developer Dashboard
- To onboard a friend:
  1. Get their Spotify account email
  2. Go to your app settings in the Developer Dashboard
  3. Add their email to the "Users" section
  4. They can then log in

### File Structure

```
/server
  /src
    /routes
      auth.js      - Spotify OAuth flow
      playlists.js - Fetch user playlists & tracks
      game.js      - Game logic (Heardle mode)
    index.js       - Express server entry

/client
  /src
    /pages         - Page components (Login, PlaylistPicker, HeardleGame)
    /hooks         - useAuth hook for token management
    api.js         - API client for backend communication
    App.jsx        - Main app component
    style.css      - Styling
  index.html       - HTML entry point
  vite.config.js   - Vite configuration
```

## Game Rules (Phase 1 - Heardle Mode)

1. Pick a playlist to play from
2. Listen to progressively longer snippets: 1s → 2s → 4s → 7s → 11s → 16s
3. Guess the song name (searchable from playlist tracks only)
4. Max 6 attempts to guess correctly
5. Win reveals full track info; loss shows the answer

## Roadmap

- **Phase 1** (current): Heardle mode web app ✓
- **Phase 2**: Hitster mode (guess artist/year)
- **Phase 3**: Unified game mode combining both
- **Phase 4**: Android app via Capacitor

## Troubleshooting

### "Spotify Premium required"
Make sure you have an active Spotify Premium subscription. Free accounts cannot use the Web Playback SDK.

### Login redirect fails
Ensure your Redirect URI in Spotify Dashboard matches exactly: `http://127.0.0.1:5173/callback`

### No playlists show up
Your account needs at least one playlist. Create one in Spotify and try again.

### Audio doesn't play
- Check your browser console for errors
- Ensure your device isn't already playing on another Spotify app
- The Web Playback SDK can only control playback on one device at a time

## Technologies

- **Frontend**: React 18 + Vite
- **Backend**: Node.js + Express
- **Audio**: Spotify Web Playback SDK
- **API**: Spotify Web API
- **Storage**: lowdb (local JSON storage for scores)

## License

Personal project for learning and entertainment.
