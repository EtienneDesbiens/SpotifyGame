import './env.js';
import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth.js';
import { playlistRouter } from './routes/playlists.js';
import { gameRouter } from './routes/game.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/playlists', playlistRouter);
app.use('/api/game', gameRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`🎵 Server running on http://localhost:${PORT}`);
});
