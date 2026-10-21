import './env.js';
import express from 'express';
import cors from 'cors';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { authRouter } from './routes/auth.js';
import { playlistRouter } from './routes/playlists.js';
import { gameRouter } from './routes/game.js';

const app = express();
const PORT = process.env.PORT || 5000;

// The same backend serves the web dev client (its own origin) and the
// Android app (Capacitor's WebView always uses https://localhost by default,
// regardless of what backend it talks to) — both must be allowed.
const ALLOWED_ORIGINS = [
  process.env.CLIENT_URL || 'http://127.0.0.1:5173',
  'https://localhost'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', authRouter);
app.use('/api/playlists', playlistRouter);
app.use('/api/game', gameRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Self-hosted mode: serve the built client from this same process so the web
// app and API share one origin (no CORS, no VITE_API_URL). The fallback hands
// every non-API GET to index.html so the OAuth redirect to /callback loads
// the SPA.
const clientDist = resolve(dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api\/|health$).*/, (req, res) => {
    res.sendFile(resolve(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`🎵 Server running on http://localhost:${PORT}`);
});
