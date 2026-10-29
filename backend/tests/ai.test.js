import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { connectTestDB, closeTestDB, clearTestDB } from './db.js';
import Song from '../src/models/Song.js';
import * as itunesService from '../src/services/itunesService.js';
import * as jamendoService from '../src/services/jamendoService.js';

let song1, song2, song3;

beforeAll(async () => {
  await connectTestDB();
  await clearTestDB();
  song1 = await Song.create({ title: 'Local Happy 1', artist: 'Artist A', mood: 'Happy', genre: 'Pop', language: 'English', isPlayable: false });
  song2 = await Song.create({ title: 'Local Happy 2', artist: 'Artist B', mood: 'Happy', genre: 'Rock', language: 'Hindi', isPlayable: false });
  song3 = await Song.create({ title: 'Local Sad 1', artist: 'Artist C', mood: 'Sad', genre: 'Acoustic', language: 'English', isPlayable: false });
});

afterAll(async () => {
  await closeTestDB();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AI & Python Recommendation Engine API Integration', () => {
  it('should return 400 if mood is missing', async () => {
    const res = await request(app).post('/api/ai/recommend').send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Mood is required');
  });

  it('should proxy recommendations to Python ML service when available', async () => {
    vi.spyOn(itunesService, 'searchItunesTracks').mockResolvedValue([]);
    vi.spyOn(jamendoService, 'searchJamendoTracks').mockResolvedValue([]);

    const song1Id = song1._id.toString();
    const song2Id = song2._id.toString();

    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/recommend')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([
            { 
              id: song2Id, 
              title: 'Local Happy 2', 
              artist: 'Artist B', 
              score: 5.5, 
              explanation: 'Matches your Happy mood and Hindi language.', 
              reasons: ['matches your Happy mood', 'matches preferred language (Hindi)'],
              scoring_factors: { mood_compatibility: 3.0, language_preference: 2.5 },
              is_playable: false, 
              language: 'Hindi', 
              provider: 'mongodb' 
            },
            { 
              id: song1Id, 
              title: 'Local Happy 1', 
              artist: 'Artist A', 
              score: 3.0, 
              explanation: 'Matches your Happy mood.', 
              reasons: ['matches your Happy mood'],
              scoring_factors: { mood_compatibility: 3.0 },
              is_playable: false, 
              language: 'English', 
              provider: 'mongodb' 
            }
          ])
        });
      }
      return Promise.reject(new Error('Unexpected fetch call in test'));
    });

    const res = await request(app)
      .post('/api/ai/recommend')
      .send({ mood: 'Happy', language: 'Hindi' });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('python-recommender');
    expect(res.body.provider).toBe('python-ml');
    expect(res.body.recommendations.length).toBe(2);
    expect(res.body.recommendations[0].id).toBe(song2Id);
    expect(res.body.recommendations[0].explanation).toContain('Matches your Happy mood and Hindi language');
    expect(res.body.recommendations[0].reasons).toContain('matches your Happy mood');
    expect(res.body.recommendations[0].scoringFactors.mood_compatibility).toBe(3.0);
  });

  it('should fall back gracefully to rule-based ranking if Python service is unavailable', async () => {
    vi.spyOn(itunesService, 'searchItunesTracks').mockResolvedValue([]);
    vi.spyOn(jamendoService, 'searchJamendoTracks').mockResolvedValue([]);

    // Simulate Python service connection failure
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:8000'));

    const res = await request(app)
      .post('/api/ai/recommend')
      .send({ mood: 'Happy' });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('rule-based');
    expect(res.body.provider).toBe('fallback');
    expect(res.body.recommendations.length).toBeGreaterThan(0);
    expect(res.body.recommendations[0].mood).toBe('Happy');
    expect(res.body.recommendations[0].reasons.length).toBeGreaterThan(0);
    expect(res.body.recommendations[0].scoringFactors.mood_compatibility).toBe(3.0);
  });

  it('should support mood transition recommendations endpoint', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/recommend/transition')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([
            { step_index: 1, target_mood: 'Sad', interpolated_progress: 0.0, recommended_songs: [{ id: song3._id.toString() }] },
            { step_index: 2, target_mood: 'Calm', interpolated_progress: 0.5, recommended_songs: [] },
            { step_index: 3, target_mood: 'Happy', interpolated_progress: 1.0, recommended_songs: [{ id: song1._id.toString() }] }
          ])
        });
      }
      return Promise.reject(new Error('Unexpected fetch call'));
    });

    const res = await request(app)
      .post('/api/ai/recommend/transition')
      .send({
        startMood: 'Sad',
        desiredMood: 'Happy',
        stepsCount: 3
      });

    expect(res.status).toBe(200);
    expect(res.body.steps).toBeDefined();
    expect(res.body.steps.length).toBe(3);
    expect(res.body.source).toBe('python-recommender');
    expect(res.body.stages).toBeDefined();
    expect(res.body.stages.length).toBe(3);
    expect(res.body.stages[0].whyThisStage).toBeDefined();
  });

  it('should generate multi-stage adaptive journey with goal template and psychological explanations', async () => {
    vi.spyOn(itunesService, 'searchItunesTracks').mockResolvedValue([]);
    vi.spyOn(jamendoService, 'searchJamendoTracks').mockResolvedValue([]);

    // Test fallback generation of adaptive journey
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('ML service offline'));

    const res = await request(app)
      .post('/api/ai/recommend/transition')
      .send({
        goal: 'lift-mood',
        startMood: 'Sad'
      });

    expect(res.status).toBe(200);
    expect(res.body.goal).toBe('lift-mood');
    expect(res.body.goalName).toBe('Lift My Mood');
    expect(res.body.stages.length).toBe(3);
    expect(res.body.stages[0].stageName).toBe('Grounding & Validation');
    expect(res.body.stages[0].whyThisStage).toContain('Validates where you are');
    expect(res.body.stages[1].stageName).toBe('Gentle Elevation');
    expect(res.body.stages[2].stageName).toBe('Joyful Radiance');
    expect(res.body.stages[0].recommendedSongs.length).toBeGreaterThan(0);
    expect(res.body.stages[0].recommendedSongs[0].scoringFactors).toBeDefined();
  });

  it('should support smart listening modes in recommendations', async () => {
    vi.spyOn(itunesService, 'searchItunesTracks').mockResolvedValue([]);
    vi.spyOn(jamendoService, 'searchJamendoTracks').mockResolvedValue([]);

    // Test fallback handling of listeningMode
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Python ML offline test'));

    const res = await request(app)
      .post('/api/ai/recommend')
      .send({ mood: 'Calm', listeningMode: 'Study' });

    expect(res.status).toBe(200);
    expect(res.body.listeningMode).toBe('Study');
    expect(res.body.recommendations.length).toBeGreaterThan(0);
    const rec = res.body.recommendations[0];
    expect(rec.scoringFactors.listening_mode).toBe(1.5);
    expect(rec.reasons).toContain('curated for Study mode');
  });

  it('should support switching between all listening modes (Relax, Sleep, Workout, Travel, Chill)', async () => {
    vi.spyOn(itunesService, 'searchItunesTracks').mockResolvedValue([]);
    vi.spyOn(jamendoService, 'searchJamendoTracks').mockResolvedValue([]);
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('ML offline'));

    const modes = [
      { mode: 'Relax', mood: 'Calm' },
      { mode: 'Sleep', mood: 'Calm' },
      { mode: 'Workout', mood: 'Energetic' },
      { mode: 'Travel', mood: 'Happy' },
      { mode: 'Chill', mood: 'Calm' }
    ];

    for (const item of modes) {
      const res = await request(app)
        .post('/api/ai/recommend')
        .send({ mood: item.mood, listeningMode: item.mode });

      expect(res.status).toBe(200);
      expect(res.body.listeningMode).toBe(item.mode);
      expect(Array.isArray(res.body.recommendations)).toBe(true);
    }
  });

  it('should handle clearing listening mode (listeningMode: null) gracefully', async () => {
    vi.spyOn(itunesService, 'searchItunesTracks').mockResolvedValue([]);
    vi.spyOn(jamendoService, 'searchJamendoTracks').mockResolvedValue([]);
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('ML offline'));

    const res = await request(app)
      .post('/api/ai/recommend')
      .send({ mood: 'Happy', listeningMode: null });

    expect(res.status).toBe(200);
    expect(res.body.listeningMode).toBeNull();
    expect(res.body.recommendations.length).toBeGreaterThan(0);
  });
});

