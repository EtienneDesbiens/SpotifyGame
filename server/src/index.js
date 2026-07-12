import './env.js';
import express from 'express';
import cors from 'cors';
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

app.listen(PORT, () => {
  console.log(`🎵 Server running on http://localhost:${PORT}`);
});
