import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { connectTestDB, closeTestDB, clearTestDB } from './db.js';
import User from '../src/models/User.js';
import Feedback from '../src/models/Feedback.js';
import Song from '../src/models/Song.js';
import { generateToken } from '../src/middleware/authMiddleware.js';
import * as itunesService from '../src/services/itunesService.js';
import * as jamendoService from '../src/services/jamendoService.js';

let user1, user2, user1Token, user2Token;
let testSong1, testSong2;

beforeAll(async () => {
  await connectTestDB();
  await clearTestDB();

  user1 = await User.create({
    name: 'Feedback User 1',
    email: 'fbuser1@moodify.ai',
    passwordHash: 'hashed_pw_123'
  });
  user1Token = generateToken(user1._id);

  user2 = await User.create({
    name: 'Feedback User 2',
    email: 'fbuser2@moodify.ai',
    passwordHash: 'hashed_pw_123'
  });
  user2Token = generateToken(user2._id);

  testSong1 = await Song.create({
    title: 'Sunny Morning',
    artist: 'Acoustic Waves',
    mood: 'Happy',
    genre: 'Acoustic',
    language: 'English',
    isPlayable: false
  });

  testSong2 = await Song.create({
    title: 'Rainy Day Blues',
    artist: 'Blues Master',
    mood: 'Sad',
    genre: 'Blues',
    language: 'English',
    isPlayable: false
  });
});

afterAll(async () => {
  await closeTestDB();
});

beforeEach(async () => {
  await Feedback.deleteMany({});
  vi.restoreAllMocks();
  vi.spyOn(itunesService, 'searchItunesTracks').mockResolvedValue([]);
  vi.spyOn(jamendoService, 'searchJamendoTracks').mockResolvedValue([]);
});

describe('Feature 2: Feedback-Based Personalization API', () => {
  it('should reject unauthenticated feedback attempts with 401', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .send({ songId: testSong1._id.toString(), action: 'like' });

    expect(res.status).toBe(401);
  });

  it('should record like feedback for authenticated user', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        songId: testSong1._id.toString(),
        action: 'like',
        title: testSong1.title,
        artist: testSong1.artist,
        genre: testSong1.genre,
        mood: testSong1.mood
      });

    expect(res.status).toBe(200);
    expect(res.body.feedback.action).toBe('like');
    expect(res.body.feedback.songId).toBe(testSong1._id.toString());
    expect(res.body.feedback.userId.toString()).toBe(user1._id.toString());

    const inDb = await Feedback.findOne({ userId: user1._id, songId: testSong1._id.toString() });
    expect(inDb).toBeTruthy();
    expect(inDb.action).toBe('like');
  });

  it('should be idempotent: repeated events do not duplicate records or cause inflation', async () => {
    const payload = {
      songId: testSong1._id.toString(),
      action: 'like',
      title: testSong1.title,
      artist: testSong1.artist
    };

    // Send repeated like events
    await request(app).post('/api/feedback').set('Authorization', `Bearer ${user1Token}`).send(payload);
    await request(app).post('/api/feedback').set('Authorization', `Bearer ${user1Token}`).send(payload);
    await request(app).post('/api/feedback').set('Authorization', `Bearer ${user1Token}`).send(payload);

    const count = await Feedback.countDocuments({ userId: user1._id, songId: testSong1._id.toString() });
    expect(count).toBe(1);
  });

  it('should resolve mutual exclusivity: disliking removes any prior like', async () => {
    const songId = testSong1._id.toString();

    // 1. User likes song
    await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ songId, action: 'like' });

    let record = await Feedback.findOne({ userId: user1._id, songId });
    expect(record.action).toBe('like');

    // 2. User then dislikes song
    await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ songId, action: 'dislike' });

    const records = await Feedback.find({ userId: user1._id, songId });
    expect(records.length).toBe(1);
    expect(records[0].action).toBe('dislike');
  });

  it('should strictly isolate feedback between authenticated users', async () => {
    const songId = testSong1._id.toString();

    // User 1 likes song
    await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ songId, action: 'like' });

    // User 2 fetches feedback
    const res = await request(app)
      .get('/api/feedback')
      .set('Authorization', `Bearer ${user2Token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(0);

    // User 2 attempts to delete User 1's feedback
    const delRes = await request(app)
      .delete(`/api/feedback/${songId}`)
      .set('Authorization', `Bearer ${user2Token}`);

    expect(delRes.status).toBe(200);
    expect(delRes.body.deletedCount).toBe(0);

    // User 1's record must still be intact
    const user1Record = await Feedback.findOne({ userId: user1._id, songId });
    expect(user1Record).toBeTruthy();
    expect(user1Record.action).toBe('like');
  });

  it('should calculate feedback summary accurately', async () => {
    await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ songId: testSong1._id.toString(), action: 'like' });

    await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ songId: testSong2._id.toString(), action: 'dislike' });

    const summaryRes = await request(app)
      .get('/api/feedback/summary')
      .set('Authorization', `Bearer ${user1Token}`);

    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.likes).toBe(1);
    expect(summaryRes.body.dislikes).toBe(1);
    expect(summaryRes.body.total).toBe(2);
  });

  it('should influence future recommendations: disliked songs are deprioritized or excluded', async () => {
    // User 1 dislikes testSong2
    await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ songId: testSong2._id.toString(), action: 'dislike' });

    // Request recommendations with fallback (no external APIs)
    const recRes = await request(app)
      .post('/api/ai/recommend')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ mood: 'Sad' });

    expect(recRes.status).toBe(200);
    const recommendedIds = recRes.body.recommendations.map(r => r.id);
    // Disliked testSong2 must not be in recommendations
    expect(recommendedIds).not.toContain(testSong2._id.toString());
  });
});
