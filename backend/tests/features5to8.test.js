import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { connectTestDB, closeTestDB, clearTestDB } from './db.js';
import User from '../src/models/User.js';
import MoodHistory from '../src/models/MoodHistory.js';
import History from '../src/models/History.js';
import Feedback from '../src/models/Feedback.js';
import Favorite from '../src/models/Favorite.js';
import Song from '../src/models/Song.js';
import RecommendationEvent from '../src/models/RecommendationEvent.js';
import { generateToken } from '../src/middleware/authMiddleware.js';
import * as itunesService from '../src/services/itunesService.js';
import * as jamendoService from '../src/services/jamendoService.js';
import * as audiusService from '../src/services/audiusService.js';

describe('Features 5, 6, 7, and 8 Master Test Suite', () => {
  let userA, userB;
  let tokenA, tokenB;
  let songHappy, songCalm, songSad;

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();

    userA = await User.create({
      name: 'Alice Tester',
      email: 'alice@moodify.test',
      passwordHash: 'hashed123',
      preferences: {
        favoriteGenres: ['Pop'],
        favoriteArtists: ['Taylor Swift']
      }
    });
    tokenA = generateToken(userA._id);

    userB = await User.create({
      name: 'Bob Tester',
      email: 'bob@moodify.test',
      passwordHash: 'hashed123'
    });
    tokenB = generateToken(userB._id);

    songHappy = await Song.create({
      title: 'Happy Sunshine',
      artist: 'Uplift Band',
      mood: 'Happy',
      genre: 'Pop',
      audioUrl: 'https://example.com/happy.mp3'
    });

    songCalm = await Song.create({
      title: 'Calm River',
      artist: 'Peaceful Mind',
      mood: 'Calm',
      genre: 'Ambient',
      audioUrl: 'https://example.com/calm.mp3'
    });

    songSad = await Song.create({
      title: 'Rainy Night',
      artist: 'Blue Notes',
      mood: 'Sad',
      genre: 'Acoustic',
      audioUrl: 'https://example.com/sad.mp3'
    });
  });

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.spyOn(itunesService, 'searchItunesTracks').mockResolvedValue([]);
    vi.spyOn(jamendoService, 'searchJamendoTracks').mockResolvedValue([]);
    vi.spyOn(audiusService, 'searchAudiusTracks').mockResolvedValue([]);
  });

  // =========================================================================
  // FEATURE 5: MOOD JOURNAL & MUSIC INSIGHTS
  // =========================================================================
  describe('Feature 5: Mood Journal & Music Insights', () => {
    beforeEach(async () => {
      await MoodHistory.deleteMany({});
      await History.deleteMany({});
      await Feedback.deleteMany({});
    });

    it('should aggregate mood journal with weekly/monthly summaries and non-diagnostic disclaimer', async () => {
      // Create userA mood logs
      await MoodHistory.create([
        { userId: userA._id, mood: 'Happy', note: 'Feeling great after workout', source: 'journal-entry', createdAt: new Date() },
        { userId: userA._id, mood: 'Happy', note: 'Sunny afternoon', source: 'face-confirmed', createdAt: new Date() },
        { userId: userA._id, mood: 'Calm', note: 'Evening tea reflection', source: 'journal-entry', createdAt: new Date() }
      ]);

      // Create correlated listening history
      await History.create([
        { userId: userA._id, songId: songHappy._id, title: 'Happy Sunshine', artist: 'Uplift Band', genre: 'Pop', mood: 'Happy', listenedDuration: 180, completed: true },
        { userId: userA._id, songId: songCalm._id, title: 'Calm River', artist: 'Peaceful Mind', genre: 'Ambient', mood: 'Calm', listenedDuration: 210, completed: true }
      ]);

      // Create feedback
      await Feedback.create([
        { userId: userA._id, songId: String(songHappy._id), action: 'like', title: 'Happy Sunshine', artist: 'Uplift Band', genre: 'Pop', mood: 'Happy' }
      ]);

      // Query via both /api/moods/analytics and /api/history/journal
      const res = await request(app)
        .get('/api/moods/analytics?range=7d')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.hasData).toBe(true);
      expect(res.body.totalMoodEntries).toBe(3);
      expect(res.body.mostFrequentMood).toBe('Happy');
      expect(res.body.weeklySummary).toBeDefined();
      expect(res.body.weeklySummary.periodLabel).toBe('Last 7 Days');
      expect(res.body.weeklySummary.mostFrequentMood).toBe('Happy');
      expect(res.body.weeklySummary.tracksLiked).toBe(1);
      expect(res.body.monthlySummary).toBeDefined();
      expect(res.body.monthlySummary.periodLabel).toBe('Last 30 Days');
      expect(res.body.moodAndMusicRelationships).toBeDefined();
      expect(res.body.journalTimeline).toHaveLength(3);
      expect(res.body.disclaimer).toContain('do not infer psychological diagnoses');
    });

    it('should isolate mood journals strictly by authenticated user', async () => {
      // UserA has 1 mood
      await MoodHistory.create({ userId: userA._id, mood: 'Happy', note: 'Private reflection', source: 'journal-entry' });
      // UserB has 0 moods

      const resA = await request(app)
        .get('/api/moods/analytics?range=7d')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(resA.status).toBe(200);
      expect(resA.body.totalMoodEntries).toBe(1);

      const resB = await request(app)
        .get('/api/moods/analytics?range=7d')
        .set('Authorization', `Bearer ${tokenB}`);
      expect(resB.status).toBe(200);
      expect(resB.body.totalMoodEntries).toBe(0);
      expect(resB.body.journalTimeline).toHaveLength(0);
    });
  });

  // =========================================================================
  // FEATURE 6: SMART MUSIC TRANSITION
  // =========================================================================
  describe('Feature 6: Smart Music Transition', () => {
    it('should generate multi-stage transition with energy level, tempo BPM, and guidance metadata', async () => {
      const res = await request(app)
        .post('/api/ai/recommend/transition')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          goal: 'lift-mood',
          startMood: 'Sad',
          desiredMood: 'Happy',
          stepsCount: 3
        });

      expect(res.status).toBe(200);
      expect(res.body.stages).toBeDefined();
      expect(res.body.stages.length).toBeGreaterThanOrEqual(3);

      const stage1 = res.body.stages[0];
      const stage2 = res.body.stages[1];
      const stage3 = res.body.stages[2];

      expect(stage1.stageName).toBe('Grounding & Validation');
      expect(stage1.energyLevel).toBeDefined();
      expect(stage1.tempoBpm).toBeDefined();
      expect(stage1.transitionGuidance).toBeDefined();

      expect(stage2.energyLevel).toContain('Transitional');
      expect(stage2.tempoBpm).toContain('BPM');

      expect(stage3.stageName).toBe('Joyful Radiance');
      expect(stage3.energyLevel).toContain('High');
      expect(stage3.tempoBpm).toContain('BPM');
    });

    it('should support custom start and target moods with step progression', async () => {
      const res = await request(app)
        .post('/api/ai/recommend/transition')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          startMood: 'Angry',
          desiredMood: 'Calm',
          stepsCount: 4
        });

      expect(res.status).toBe(200);
      expect(res.body.stages).toHaveLength(4);
      expect(res.body.startMood).toBe('Angry');
      expect(res.body.desiredMood).toBe('Calm');
      expect(res.body.stages[0].stageName).toBe('Grounding');
      expect(res.body.stages[3].stageName).toBe('Destination State');
    });
  });

  // =========================================================================
  // FEATURE 7: PRIVACY CONTROLS
  // =========================================================================
  describe('Feature 7: Privacy Controls', () => {
    beforeEach(async () => {
      await MoodHistory.deleteMany({});
      await History.deleteMany({});
    });

    it('should clear all mood history for authenticated user via DELETE /api/moods', async () => {
      // UserA and UserB create mood logs
      await MoodHistory.create({ userId: userA._id, mood: 'Sad', note: 'A mood' });
      await MoodHistory.create({ userId: userB._id, mood: 'Happy', note: 'B mood' });

      // UserA clears all moods
      const deleteRes = await request(app)
        .delete('/api/moods')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.message).toContain('cleared successfully');

      // Verify userA's moods are deleted, but userB's moods remain intact
      const moodsA = await MoodHistory.find({ userId: userA._id });
      expect(moodsA).toHaveLength(0);

      const moodsB = await MoodHistory.find({ userId: userB._id });
      expect(moodsB).toHaveLength(1);
    });

    it('should clear listening history for authenticated user via DELETE /api/history', async () => {
      await History.create({ userId: userA._id, songId: songHappy._id, title: 'Happy Sunshine', artist: 'Uplift Band' });
      await History.create({ userId: userB._id, songId: songCalm._id, title: 'Calm River', artist: 'Peaceful Mind' });

      const res = await request(app)
        .delete('/api/history')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);

      const histA = await History.find({ userId: userA._id });
      expect(histA).toHaveLength(0);

      const histB = await History.find({ userId: userB._id });
      expect(histB).toHaveLength(1);
    });

    it('should reject unauthenticated calls to clear data endpoints with 401', async () => {
      const resMood = await request(app).delete('/api/moods');
      expect(resMood.status).toBe(401);

      const resHist = await request(app).delete('/api/history');
      expect(resHist.status).toBe(401);

      const resTaste = await request(app).post('/api/profile/taste/reset-inferred');
      expect(resTaste.status).toBe(401);
    });
  });

  // =========================================================================
  // FEATURE 8: RECOMMENDATION EVALUATION DASHBOARD
  // =========================================================================
  describe('Feature 8: Recommendation Evaluation Dashboard', () => {
    beforeEach(async () => {
      await RecommendationEvent.deleteMany({});
    });

    it('should record recommendation events with strict deduplication', async () => {
      const eventPayload = {
        eventId: 'test_event_dedup_001',
        eventType: 'impression',
        songId: String(songHappy._id),
        title: 'Happy Sunshine',
        artist: 'Uplift Band',
        genre: 'Pop',
        mood: 'Happy'
      };

      // First call logs event
      const res1 = await request(app)
        .post('/api/ai/events')
        .send(eventPayload);
      expect(res1.status).toBe(201);
      expect(res1.body.success).toBe(true);

      // Duplicate call with identical eventId must not duplicate
      const res2 = await request(app)
        .post('/api/ai/events')
        .send(eventPayload);
      expect(res2.status).toBe(201);

      const totalInDb = await RecommendationEvent.countDocuments({ eventId: 'test_event_dedup_001' });
      expect(totalInDb).toBe(1);
    });

    it('should aggregate recommendation evaluation metrics and conversion breakdown', async () => {
      // Log impression, play, and like
      await request(app).post('/api/ai/events').send({
        eventId: 'ev_imp_1',
        eventType: 'impression',
        songId: String(songHappy._id),
        title: 'Happy Sunshine',
        artist: 'Uplift Band',
        genre: 'Pop',
        mood: 'Happy'
      });

      await request(app).post('/api/ai/events').send({
        eventId: 'ev_play_1',
        eventType: 'play',
        songId: String(songHappy._id),
        title: 'Happy Sunshine',
        artist: 'Uplift Band',
        genre: 'Pop',
        mood: 'Happy'
      });

      await request(app).post('/api/ai/events').send({
        eventId: 'ev_like_1',
        eventType: 'like',
        songId: String(songHappy._id),
        title: 'Happy Sunshine',
        artist: 'Uplift Band',
        genre: 'Pop',
        mood: 'Happy'
      });

      const res = await request(app).get('/api/ai/evaluation?range=7d');
      expect(res.status).toBe(200);
      expect(res.body.metrics).toBeDefined();
      expect(res.body.metrics.totalPlays).toBeGreaterThanOrEqual(1);
      expect(res.body.metrics.totalLikes).toBeGreaterThanOrEqual(1);
      expect(res.body.metrics.conversionRate).toBeGreaterThan(0);
      expect(res.body.breakdownByMood).toBeDefined();
      expect(res.body.recentEvents).toBeDefined();
    });

    it('should return real empirical FER-2013 ResNet-18 model evaluation metrics via /api/ml/evaluation-metrics', async () => {
      const res = await request(app).get('/api/ml/evaluation-metrics');
      expect(res.status).toBe(200);
      expect(res.body.modelName).toContain('ResNet-18');
      expect(res.body.numSamples).toBe(7178);
      expect(res.body.overallAccuracy).toBeCloseTo(0.6513, 2);
      expect(res.body.macroF1).toBeCloseTo(0.6183, 2);
      expect(res.body.classMetrics).toBeDefined();
      expect(res.body.classMetrics.happy).toBeDefined();
      expect(res.body.classMetrics.happy.f1_score).toBeGreaterThan(0.8);
      expect(res.body.confusionMatrix).toHaveLength(7);
      expect(res.body.improvement.accuracyDeltaPercent).toBeGreaterThan(10);
      expect(res.body.disclaimer).toContain('FER-2013');
    });
  });
});
