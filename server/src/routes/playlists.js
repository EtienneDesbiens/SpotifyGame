import express from 'express';
import axios from 'axios';

const router = express.Router();
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';

const getAuthHeader = (req) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) throw new Error('Missing authorization token');
  return { Authorization: `Bearer ${token}` };
};

router.get('/', async (req, res) => {
  try {
    const headers = getAuthHeader(req);
    const response = await axios.get(`${SPOTIFY_API_URL}/me/playlists?limit=50`, { headers });

    res.json(response.data.items
      .filter(p => p)
      .map(p => ({
        id: p.id,
        name: p.name,
        images: p.images,
        tracks: { total: p.tracks?.total ?? 0 }
      })));
  } catch (error) {
    console.error('Playlists fetch error:', error.response?.status, JSON.stringify(error.response?.data) || error.message);
    res.status(error.response?.status || 500).json({ error: 'Failed to fetch playlists' });
  }
});

// Registered before the /:playlistId/tracks route below since that dynamic
// route would otherwise also match this path (playlistId='liked-songs').
router.get('/liked-songs/tracks', async (req, res) => {
  try {
    const headers = getAuthHeader(req);
    let tracks = [];
    let nextUrl = `${SPOTIFY_API_URL}/me/tracks?limit=50`;

    while (nextUrl) {
      const response = await axios.get(nextUrl, { headers });
      tracks = tracks.concat(
        response.data.items
          .filter(item => item.track)
          .map(item => {
            const t = item.track;
            return {
              id: t.id,
              name: t.name,
              artists: t.artists.map(a => a.name),
              album: {
                id: t.album.id,
                name: t.album.name,
                image: t.album.images?.[0]?.url,
                releaseDate: t.album.release_date
              },
              durationMs: t.duration_ms,
              previewUrl: t.preview_url
            };
          })
      );
      nextUrl = response.data.next;
    }

    res.json({ tracks });
  } catch (error) {
    console.error('Liked songs fetch error:', error.response?.status, JSON.stringify(error.response?.data) || error.message);
    res.status(error.response?.status || 500).json({ error: 'Failed to fetch liked songs' });
  }
});

router.get('/saved-albums/tracks', async (req, res) => {
  try {
    const headers = getAuthHeader(req);
    let tracks = [];
    let nextUrl = `${SPOTIFY_API_URL}/me/albums?limit=50`;

    while (nextUrl) {
      const response = await axios.get(nextUrl, { headers });
      response.data.items.forEach(item => {
        const album = item.album;
        album.tracks.items.forEach(t => {
          tracks.push({
            id: t.id,
            name: t.name,
            artists: t.artists.map(a => a.name),
            album: {
              id: album.id,
              name: album.name,
              image: album.images?.[0]?.url,
              releaseDate: album.release_date
            },
            durationMs: t.duration_ms,
            previewUrl: t.preview_url
          });
        });
      });
      nextUrl = response.data.next;
    }

    res.json({ tracks });
  } catch (error) {
    console.error('Saved albums fetch error:', error.response?.status, JSON.stringify(error.response?.data) || error.message);
    res.status(error.response?.status || 500).json({ error: 'Failed to fetch saved albums' });
  }
});

router.get('/top-tracks/tracks', async (req, res) => {
  try {
    const headers = getAuthHeader(req);
    let tracks = [];
    let nextUrl = `${SPOTIFY_API_URL}/me/top/tracks?limit=50&time_range=medium_term`;

    while (nextUrl) {
      const response = await axios.get(nextUrl, { headers });
      tracks = tracks.concat(response.data.items.map(t => ({
        id: t.id,
        name: t.name,
        artists: t.artists.map(a => a.name),
        album: {
          id: t.album.id,
          name: t.album.name,
          image: t.album.images?.[0]?.url,
          releaseDate: t.album.release_date
        },
        durationMs: t.duration_ms,
        previewUrl: t.preview_url
      })));
      nextUrl = response.data.next;
    }

    res.json({ tracks });
  } catch (error) {
    console.error('Top tracks fetch error:', error.response?.status, JSON.stringify(error.response?.data) || error.message);
    res.status(error.response?.status || 500).json({ error: 'Failed to fetch top tracks' });
  }
});

router.get('/recently-played/tracks', async (req, res) => {
  try {
    const headers = getAuthHeader(req);
    const response = await axios.get(`${SPOTIFY_API_URL}/me/player/recently-played?limit=50`, { headers });

    const seen = new Set();
    const tracks = [];
    response.data.items.forEach(item => {
      const t = item.track;
      if (seen.has(t.id)) return;
      seen.add(t.id);
      tracks.push({
        id: t.id,
        name: t.name,
        artists: t.artists.map(a => a.name),
        album: {
          id: t.album.id,
          name: t.album.name,
          image: t.album.images?.[0]?.url,
          releaseDate: t.album.release_date
        },
        durationMs: t.duration_ms,
        previewUrl: t.preview_url
      });
    });

    res.json({ tracks });
  } catch (error) {
    console.error('Recently played fetch error:', error.response?.status, JSON.stringify(error.response?.data) || error.message);
    res.status(error.response?.status || 500).json({ error: 'Failed to fetch recently played tracks' });
  }
});

router.get('/followed-artists/tracks', async (req, res) => {
  try {
    const headers = getAuthHeader(req);
    const followedRes = await axios.get(`${SPOTIFY_API_URL}/me/following?type=artist&limit=50`, { headers });
    const artists = followedRes.data.artists.items.slice(0, 20);

    const trackLists = await Promise.all(
      artists.map(artist =>
        axios.get(`${SPOTIFY_API_URL}/artists/${artist.id}/top-tracks`, { headers })
          .then(r => r.data.tracks)
          .catch(() => [])
      )
    );

    const seen = new Set();
    const tracks = [];
    trackLists.flat().forEach(t => {
      if (seen.has(t.id)) return;
      seen.add(t.id);
      tracks.push({
        id: t.id,
        name: t.name,
        artists: t.artists.map(a => a.name),
        album: {
          id: t.album.id,
          name: t.album.name,
          image: t.album.images?.[0]?.url,
          releaseDate: t.album.release_date
        },
        durationMs: t.duration_ms,
        previewUrl: t.preview_url
      });
    });

    res.json({ tracks });
  } catch (error) {
    console.error('Followed artists fetch error:', error.response?.status, JSON.stringify(error.response?.data) || error.message);
    res.status(error.response?.status || 500).json({ error: 'Failed to fetch followed artists tracks' });
  }
});

router.get('/:playlistId/tracks', async (req, res) => {
  const { playlistId } = req.params;

  try {
    const headers = getAuthHeader(req);
    let tracks = [];
    let nextUrl = `${SPOTIFY_API_URL}/playlists/${playlistId}/items?limit=50&fields=items(item(id,name,artists,album(id,name,images,release_date),duration_ms,preview_url)),next`;

    while (nextUrl) {
      const response = await axios.get(nextUrl, { headers });
      tracks = tracks.concat(
        response.data.items
          .filter(item => item.item)
          .map(item => {
            const t = item.item;
            return {
              id: t.id,
              name: t.name,
              artists: t.artists.map(a => a.name),
              album: {
                id: t.album.id,
                name: t.album.name,
                image: t.album.images?.[0]?.url,
                releaseDate: t.album.release_date
              },
              durationMs: t.duration_ms,
              previewUrl: t.preview_url
            };
          })
      );
      nextUrl = response.data.next;
    }

    res.json({ tracks });
  } catch (error) {
    console.error('Tracks fetch error:', error.response?.status, JSON.stringify(error.response?.data) || error.message);
    res.status(error.response?.status || 500).json({ error: 'Failed to fetch playlist tracks' });
  }
});

export const playlistRouter = router;
