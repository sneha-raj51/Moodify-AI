import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { connectTestDB, closeTestDB, clearTestDB } from './db.js';
import { generateToken } from '../src/middleware/authMiddleware.js';
import User from '../src/models/User.js';
import History from '../src/models/History.js';

process.env.JWT_SECRET = 'test_secret_key';

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await closeTestDB();
});

beforeEach(async () => {
  await clearTestDB();
});

describe('Listening Recap & Mix API', () => {
  let user, token;

  beforeEach(async () => {
    user = await User.create({ name: 'Charlie', email: 'charlie@example.com', passwordHash: 'password123' });
    token = generateToken(user._id);
  });

  it('should handle empty history gracefully', async () => {
    const res = await request(app)
      .get('/api/history/recap?range=7d&mode=from-listening')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.stats.totalListens).toBe(0);
    expect(res.body.stats.totalDurationSeconds).toBe(0);
    expect(res.body.stats.mostPlayedTracks).toEqual([]);
    expect(res.body.generatedPlaylist).toEqual([]);
  });

  it('should aggregate listening events in period and build From My Listening playlist', async () => {
    // Seed history events
    await History.create([
      {
        userId: user._id,
        songId: 'song_1',
        title: 'Song One',
        artist: 'Artist A',
        genre: 'Pop',
        mood: 'Happy',
        listenedDuration: 45,
        isMeaningful: true,
        completed: true,
        audioUrl: 'https://example.com/song1.mp3'
      },
      {
        userId: user._id,
        songId: 'song_1',
        title: 'Song One',
        artist: 'Artist A',
        genre: 'Pop',
        mood: 'Happy',
        listenedDuration: 50,
        isMeaningful: true,
        completed: true,
        audioUrl: 'https://example.com/song1.mp3'
      },
      {
        userId: user._id,
        songId: 'song_2',
        title: 'Song Two',
        artist: 'Artist B',
        genre: 'Rock',
        mood: 'Energetic',
        listenedDuration: 20,
        isMeaningful: false,
        completed: false
      }
    ]);

    const res = await request(app)
      .get('/api/history/recap?range=7d&mode=from-listening')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.stats.totalListens).toBe(3);
    expect(res.body.stats.totalDurationSeconds).toBe(115);
    expect(res.body.stats.completedTracks).toBe(2);
    expect(res.body.stats.repeatedListensCount).toBe(1); // song_1 repeated
    expect(res.body.stats.topArtists[0].name).toBe('Artist A');
    expect(res.body.stats.topGenres[0].name).toBe('Pop');

    // Generated playlist should only have the 2 unique songs user actually listened to
    expect(res.body.generatedPlaylist.length).toBe(2);
    expect(res.body.generatedPlaylist[0].title).toBe('Song One');
    expect(res.body.generatedPlaylist[0].count).toBe(2);
    expect(res.body.generatedPlaylist[0].isRecommendation).toBe(false);

    // Standardized contract verification
    expect(res.body.recap).toBeDefined();
    expect(res.body.stats).toBeDefined();
    expect(res.body.playlist).toBeDefined();
    expect(res.body.generatedPlaylist).toBeDefined();
    expect(res.body.stats.topArtists[0].artist).toBe('Artist A');
    expect(res.body.stats.topArtists[0].name).toBe('Artist A');
    expect(res.body.stats.topGenres[0].genre).toBe('Pop');
    expect(res.body.stats.topGenres[0].name).toBe('Pop');
    expect(res.body.mode).toBe('from-listening');
  });

  it('From My Listening never includes unheard recommendations', async () => {
    await History.create({
      userId: user._id,
      songId: 'song_solo',
      title: 'Solo Played Song',
      artist: 'Solo Artist',
      genre: 'Pop',
      mood: 'Happy',
      listenedDuration: 60
    });

    const res = await request(app)
      .get('/api/history/recap?range=7d&mode=from-listening')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.playlist.length).toBe(1);
    expect(res.body.playlist[0].title).toBe('Solo Played Song');
    expect(res.body.playlist.every(s => s.isRecommendation === false)).toBe(true);
  });

  describe('Custom Date Range & Timezone Contract', () => {
    it('should validate missing custom dates with 400', async () => {
      const res = await request(app)
        .get('/api/history/recap?range=custom&from=2026-05-01')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Both "from" and "to" date parameters are required/i);
    });

    it('should validate invalid date formats with 400', async () => {
      const res = await request(app)
        .get('/api/history/recap?range=custom&from=invalid-date&to=2026-05-10')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Invalid date format/i);
    });

    it('should validate from date after to date with 400', async () => {
      const res = await request(app)
        .get('/api/history/recap?range=custom&from=2026-05-20&to=2026-05-10')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/"from" date must be before or equal to "to" date/i);
    });

    it('should include the entire selected end date up to 23:59:59.999Z (events near midnight)', async () => {
      // Seed an event at 23:55:00 UTC on the end date 2026-05-10
      const midnightEvent = new History({
        userId: user._id,
        songId: 'song_midnight',
        title: 'Midnight Track',
        artist: 'Night Owl',
        genre: 'Electronic',
        mood: 'Calm',
        listenedDuration: 40,
        createdAt: new Date('2026-05-10T23:55:00.000Z')
      });
      await midnightEvent.save();

      // Seed an event at 00:05:00 UTC on the next day 2026-05-11 (should be excluded)
      const nextDayEvent = new History({
        userId: user._id,
        songId: 'song_next_day',
        title: 'Next Day Track',
        artist: 'Morning Lark',
        genre: 'Pop',
        mood: 'Happy',
        listenedDuration: 30,
        createdAt: new Date('2026-05-11T00:05:00.000Z')
      });
      await nextDayEvent.save();

      const res = await request(app)
        .get('/api/history/recap?range=custom&from=2026-05-01&to=2026-05-10&mode=from-listening')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.stats.totalListens).toBe(1);
      expect(res.body.playlist.length).toBe(1);
      expect(res.body.playlist[0].title).toBe('Midnight Track');
    });
  });

  describe('History Authentication & User Isolation', () => {
    it('should reject unauthenticated access to history endpoints with 401', async () => {
      const getRes = await request(app).get('/api/history');
      expect(getRes.status).toBe(401);

      const postRes = await request(app).post('/api/history').send({
        songId: 'guest_song_a',
        title: 'Guest Song A',
        artist: 'Guest Artist A'
      });
      expect(postRes.status).toBe(401);

      const deleteRes = await request(app).delete('/api/history');
      expect(deleteRes.status).toBe(401);
    });

    it('should strictly isolate history between authenticated users', async () => {
      const userAlpha = await User.create({ name: 'Alpha', email: 'alpha@example.com', passwordHash: 'password123' });
      const tokenAlpha = generateToken(userAlpha._id);

      const userBeta = await User.create({ name: 'Beta', email: 'beta@example.com', passwordHash: 'password123' });
      const tokenBeta = generateToken(userBeta._id);

      // User Alpha logs a song
      await request(app)
        .post('/api/history')
        .set('Authorization', `Bearer ${tokenAlpha}`)
        .send({
          songId: 'alpha_song_1',
          title: 'Alpha Song 1',
          artist: 'Alpha Artist',
          listenedDuration: 30
        });

      // User Beta logs a song
      await request(app)
        .post('/api/history')
        .set('Authorization', `Bearer ${tokenBeta}`)
        .send({
          songId: 'beta_song_1',
          title: 'Beta Song 1',
          artist: 'Beta Artist',
          listenedDuration: 45
        });

      // User Alpha fetches history -> only Alpha's song
      const resAlpha = await request(app)
        .get('/api/history')
        .set('Authorization', `Bearer ${tokenAlpha}`);

      expect(resAlpha.status).toBe(200);
      expect(resAlpha.body.length).toBe(1);
      expect(resAlpha.body[0].title).toBe('Alpha Song 1');

      // User Beta fetches history -> only Beta's song
      const resBeta = await request(app)
        .get('/api/history')
        .set('Authorization', `Bearer ${tokenBeta}`);

      expect(resBeta.status).toBe(200);
      expect(resBeta.body.length).toBe(1);
      expect(resBeta.body[0].title).toBe('Beta Song 1');

      // User Alpha clears history -> must NOT affect User Beta
      await request(app)
        .delete('/api/history')
        .set('Authorization', `Bearer ${tokenAlpha}`);

      const verifyAlpha = await request(app)
        .get('/api/history')
        .set('Authorization', `Bearer ${tokenAlpha}`);
      expect(verifyAlpha.body.length).toBe(0);

      const verifyBeta = await request(app)
        .get('/api/history')
        .set('Authorization', `Bearer ${tokenBeta}`);
      expect(verifyBeta.body.length).toBe(1);
      expect(verifyBeta.body[0].title).toBe('Beta Song 1');
    });
  });
});
