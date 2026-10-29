import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { connectTestDB, closeTestDB, clearTestDB } from './db.js';
import User from '../src/models/User.js';
import History from '../src/models/History.js';
import MoodHistory from '../src/models/MoodHistory.js';
import Feedback from '../src/models/Feedback.js';
import { generateToken } from '../src/middleware/authMiddleware.js';

let userA, tokenA, userB, tokenB;

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await closeTestDB();
});

beforeEach(async () => {
  await clearTestDB();

  userA = await User.create({
    name: 'User A',
    email: 'userA_journal@example.com',
    passwordHash: 'hashed_pw_A'
  });
  tokenA = generateToken(userA._id);

  userB = await User.create({
    name: 'User B',
    email: 'userB_journal@example.com',
    passwordHash: 'hashed_pw_B'
  });
  tokenB = generateToken(userB._id);
});

describe('Mood Journal and Music Insights API', () => {
  it('should require authentication to access /api/history/journal', async () => {
    const res = await request(app).get('/api/history/journal');
    expect(res.status).toBe(401);
  });

  it('should return empty state when user has no mood or listening history', async () => {
    const res = await request(app)
      .get('/api/history/journal?range=7d')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.hasData).toBe(false);
    expect(res.body.totalMoodEntries).toBe(0);
    expect(res.body.journalTimeline).toEqual([]);
    expect(res.body.listeningMetrics.totalListens).toBe(0);
  });

  it('should record mood journal entries with note and source tag', async () => {
    const res = await request(app)
      .post('/api/moods')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        mood: 'Calm',
        source: 'journal-entry',
        note: 'Practicing deep breathing before study session'
      });

    expect(res.status).toBe(201);
    expect(res.body.mood).toBe('Calm');
    expect(res.body.source).toBe('journal-entry');
    expect(res.body.note).toBe('Practicing deep breathing before study session');
    expect(res.body.userId).toBe(userA._id.toString());
  });

  it('should aggregate mood journal insights and correlate listening history', async () => {
    const now = new Date();

    // Create mood entries for User A
    await MoodHistory.create({
      userId: userA._id || userA.id,
      mood: 'Happy',
      source: 'manual',
      note: 'Celebrated project completion',
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000)
    });

    await MoodHistory.create({
      userId: userA._id || userA.id,
      mood: 'Happy',
      source: 'face-detected',
      note: 'Smiling at laptop',
      createdAt: new Date(now.getTime() - 1 * 60 * 60 * 1000)
    });

    await MoodHistory.create({
      userId: userA._id || userA.id,
      mood: 'Calm',
      source: 'journal-entry',
      note: 'Evening wind-down',
      createdAt: new Date(now.getTime() - 30 * 60 * 1000)
    });

    // Create listening history for User A
    await History.create({
      userId: userA._id || userA.id,
      songId: 'song_happy_1',
      title: 'Uptown Funk',
      artist: 'Mark Ronson',
      genre: 'Funk Pop',
      mood: 'Happy',
      listenedDuration: 210,
      completed: true,
      createdAt: new Date(now.getTime() - 90 * 60 * 1000)
    });

    await History.create({
      userId: userA._id || userA.id,
      songId: 'song_calm_1',
      title: 'Weightless',
      artist: 'Marconi Union',
      genre: 'Ambient',
      mood: 'Calm',
      listenedDuration: 8,
      completed: false,
      skipped: true,
      createdAt: new Date(now.getTime() - 20 * 60 * 1000)
    });

    // Create feedback for User A
    await Feedback.create({
      userId: userA._id || userA.id,
      songId: 'song_happy_1',
      action: 'like'
    });

    // Create data for User B to verify user isolation
    await MoodHistory.create({
      userId: userB._id || userB.id,
      mood: 'Angry',
      source: 'manual',
      note: 'Traffic jam',
      createdAt: now
    });

    const res = await request(app)
      .get('/api/history/journal?range=7d')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.hasData).toBe(true);
    expect(res.body.totalMoodEntries).toBe(3);
    expect(res.body.mostFrequentMood).toBe('Happy');

    // Verify top moods percentage
    const happyMood = res.body.topMoods.find(m => m.mood === 'Happy');
    expect(happyMood.count).toBe(2);
    expect(happyMood.percentage).toBe(67);

    // Verify listening metrics
    const metrics = res.body.listeningMetrics;
    expect(metrics.totalListens).toBe(2);
    expect(metrics.completedCount).toBe(1);
    expect(metrics.skipCount).toBe(1);
    expect(metrics.completionRate).toBe(50);
    expect(metrics.skipRate).toBe(50);
    expect(metrics.feedback.likes).toBe(1);

    // Verify correlations
    expect(res.body.genreMoodCorrelations.Happy).toBeDefined();
    expect(res.body.genreMoodCorrelations.Happy[0].genre).toBe('Funk Pop');
    expect(res.body.topArtistsByMood.Happy[0].artist).toBe('Mark Ronson');

    // Verify journal timeline
    expect(res.body.journalTimeline.length).toBe(3);
    const calmEntry = res.body.journalTimeline.find(j => j.mood === 'Calm');
    expect(calmEntry.note).toBe('Evening wind-down');
    expect(calmEntry.correlatedTracks.length).toBeGreaterThan(0);
    expect(calmEntry.correlatedTracks[0].title).toBe('Weightless');

    // Verify User B's 'Angry' mood is not leaked
    const angryMood = res.body.topMoods.find(m => m.mood === 'Angry');
    expect(angryMood).toBeUndefined();
  });

  it('should support time range filtering (7d vs 30d vs all)', async () => {
    const now = new Date();

    // Old entry (15 days ago)
    await MoodHistory.create({
      userId: userA._id || userA.id,
      mood: 'Sad',
      createdAt: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000)
    });

    // Recent entry (2 days ago)
    await MoodHistory.create({
      userId: userA._id || userA.id,
      mood: 'Energetic',
      createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
    });

    // 7 days query: should only include Energetic
    const res7d = await request(app)
      .get('/api/history/journal?range=7d')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res7d.body.totalMoodEntries).toBe(1);
    expect(res7d.body.topMoods[0].mood).toBe('Energetic');

    // 30 days query: should include both Sad and Energetic
    const res30d = await request(app)
      .get('/api/history/journal?range=30d')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res30d.body.totalMoodEntries).toBe(2);

    // All time query: should include both
    const resAll = await request(app)
      .get('/api/history/journal?range=all')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(resAll.body.totalMoodEntries).toBe(2);
  });

  it('should support deleting a mood entry with user isolation', async () => {
    const entryA = await MoodHistory.create({
      userId: userA._id || userA.id,
      mood: 'Sad',
      note: 'Need a reset'
    });

    // User B attempts to delete User A's entry -> 404
    const resForbidden = await request(app)
      .delete(`/api/moods/${entryA._id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(resForbidden.status).toBe(404);

    // User A deletes own entry -> 200
    const resSuccess = await request(app)
      .delete(`/api/moods/${entryA._id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(resSuccess.status).toBe(200);

    const exists = await MoodHistory.findById(entryA._id);
    expect(exists).toBeNull();
  });

  it('should compute comprehensive Weekly and Monthly summaries with mood-music relationships', async () => {
    const now = new Date();

    // Create 3 mood entries across the week for User A
    await MoodHistory.create({
      userId: userA._id,
      mood: 'Calm',
      source: 'manual',
      createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    });
    await MoodHistory.create({
      userId: userA._id,
      mood: 'Calm',
      source: 'face-detected',
      createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
    });
    await MoodHistory.create({
      userId: userA._id,
      mood: 'Happy',
      source: 'journal-entry',
      createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000)
    });

    // Create listening history
    await History.create({
      userId: userA._id,
      songId: 'song_calm_1',
      title: 'Weightless',
      artist: 'Marconi Union',
      genre: 'Ambient',
      mood: 'Calm',
      listenedDuration: 240,
      completed: true,
      createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    });

    // Create feedback
    await Feedback.create({
      userId: userA._id,
      songId: 'song_calm_1',
      action: 'like',
      title: 'Weightless',
      artist: 'Marconi Union',
      genre: 'Ambient',
      mood: 'Calm'
    });
    await Feedback.create({
      userId: userA._id,
      songId: 'song_skip_1',
      action: 'skip',
      title: 'Loud Noise',
      artist: 'Noisy Band',
      genre: 'Metal',
      mood: 'Calm'
    });

    const res = await request(app)
      .get('/api/history/journal?range=7d')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.weeklySummary).toBeDefined();
    expect(res.body.weeklySummary.entriesCount).toBe(3);
    expect(res.body.weeklySummary.mostFrequentMood).toBe('Calm');
    expect(res.body.weeklySummary.tracksLiked).toBe(1);
    expect(res.body.weeklySummary.tracksSkipped).toBe(1);
    expect(Array.isArray(res.body.weeklySummary.moodChangesAcrossWeek)).toBe(true);

    expect(res.body.monthlySummary).toBeDefined();
    expect(res.body.monthlySummary.totalEntries).toBe(3);
    expect(res.body.monthlySummary.frequentlyLikedGenres).toEqual(
      expect.arrayContaining([expect.objectContaining({ genre: 'Ambient', count: 1 })])
    );

    expect(res.body.moodAndMusicRelationships).toBeDefined();
    expect(Array.isArray(res.body.moodAndMusicRelationships.moodFeedbackAssociations)).toBe(true);
    expect(res.body.disclaimer).toMatch(/not infer psychological diagnoses/i);
  });

  it('should support custom date range filtering and reject invalid date bounds', async () => {
    // Valid custom range
    const resValid = await request(app)
      .get('/api/history/journal?range=custom&from=2026-01-01&to=2026-12-31')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(resValid.status).toBe(200);

    // Missing bounds
    const resMissing = await request(app)
      .get('/api/history/journal?range=custom&from=2026-01-01')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(resMissing.status).toBe(400);

    // Inverted bounds
    const resInverted = await request(app)
      .get('/api/history/journal?range=custom&from=2026-12-31&to=2026-01-01')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(resInverted.status).toBe(400);
  });
});
