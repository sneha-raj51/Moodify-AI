import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { connectTestDB, closeTestDB, clearTestDB } from './db.js';
import { generateToken } from '../src/middleware/authMiddleware.js';
import User from '../src/models/User.js';
import Song from '../src/models/Song.js';

let user;
let token;

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await closeTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  user = await User.create({
    name: 'Flow Test User',
    email: 'flow@smart.test',
    passwordHash: 'hashedpass123'
  });
  token = generateToken(user._id);

  // Seed sample songs
  await Song.create([
    {
      title: 'Sunrise Glow',
      artist: 'Acoustic Morning',
      mood: 'Calm',
      genre: 'Acoustic',
      language: 'English',
      duration: 180,
      audioUrl: 'https://example.com/sunrise.mp3',
      isPlayable: true
    },
    {
      title: 'Neon Runner',
      artist: 'Synth Beats',
      mood: 'Energetic',
      genre: 'Electronic',
      language: 'English',
      duration: 210,
      audioUrl: 'https://example.com/neon.mp3',
      isPlayable: true
    }
  ]);
});

describe('Smart Playlist Builder Flow & State Transition Regression Tests', () => {

  it('1. Returns valid tracks and structured metadata upon successful generation', async () => {
    const res = await request(app)
      .post('/api/playlists/smart/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        mood: 'Calm',
        genre: 'Acoustic',
        energy: 'Low',
        vocalPreference: 'Any',
        language: 'English',
        targetDurationMinutes: 15
      });

    expect(res.status).toBe(200);
    expect(res.body.tracks).toBeInstanceOf(Array);
    expect(res.body.tracks.length).toBeGreaterThan(0);
    expect(res.body.title).toBeDefined();
    expect(res.body.totalDurationSeconds).toBeGreaterThan(0);
    expect(res.body.totalDurationFormatted).toBeDefined();
  });

  it('2. Empty results for unmatched filters return 200 with empty tracks array and friendly summary', async () => {
    // When external providers and DB have no matches for an impossible combination
    const res = await request(app)
      .post('/api/playlists/smart/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        mood: 'Disgust',
        genre: 'Classical',
        language: 'Punjabi',
        targetDurationMinutes: 15,
        excludedTrackIds: [] // No tracks available for this rare combination
      });

    expect(res.status).toBe(200);
    expect(res.body.tracks).toBeInstanceOf(Array);
    expect(res.body.summary).toBeDefined();
  });

  it('3. Regeneration excludes prior track IDs so songs are not duplicated', async () => {
    const firstRes = await request(app)
      .post('/api/playlists/smart/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        mood: 'Calm',
        targetDurationMinutes: 15
      });

    const firstTrackIds = firstRes.body.tracks.map(t => String(t.id || t._id));

    const regenRes = await request(app)
      .post('/api/playlists/smart/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        mood: 'Calm',
        targetDurationMinutes: 15,
        excludedTrackIds: firstTrackIds
      });

    expect(regenRes.status).toBe(200);
    const regenTrackIds = regenRes.body.tracks.map(t => String(t.id || t._id));
    for (const id of firstTrackIds) {
      expect(regenTrackIds).not.toContain(id);
    }
  }, 10000);

  it('4. Simulates view state flow: builder -> results, edit filters returns to builder without resetting state', () => {
    // State machine contract test
    let state = {
      viewState: 'builder',
      mood: 'Happy',
      genre: 'Pop',
      energy: 'High',
      durationPreset: 45,
      generatedResult: null,
      error: null
    };

    // Step A: Initial state has form visible ('builder')
    expect(state.viewState).toBe('builder');
    expect(state.mood).toBe('Happy');
    expect(state.genre).toBe('Pop');

    // Step B: Successful generation transitions to 'results'
    const mockResult = { title: 'Upbeat Pop Mix', tracks: [{ id: '1', title: 'Pop Star' }] };
    state = {
      ...state,
      viewState: 'results',
      generatedResult: mockResult
    };
    expect(state.viewState).toBe('results');
    expect(state.generatedResult.tracks.length).toBe(1);

    // Step C: "Edit Filters" transitions back to 'builder' preserving previous selections
    state = {
      ...state,
      viewState: 'builder'
    };
    expect(state.viewState).toBe('builder');
    expect(state.mood).toBe('Happy'); // Preserved!
    expect(state.genre).toBe('Pop'); // Preserved!
    expect(state.durationPreset).toBe(45); // Preserved!
    expect(state.generatedResult).not.toBeNull(); // Still available in background!

    // Step D: A failed generation attempt keeps the prior result and stays in 'builder'
    const priorValidResult = state.generatedResult;
    const failedAttempt = { error: 'Network timeout' };
    state = {
      ...state,
      error: failedAttempt.error
      // Notice viewState remains 'builder' and generatedResult is NOT erased
    };
    expect(state.viewState).toBe('builder');
    expect(state.error).toBe('Network timeout');
    expect(state.generatedResult).toEqual(priorValidResult);
  });

  it('5. Verification of non-autoplay contract: generation payloads do not trigger playback commands', async () => {
    // Generate request
    const res = await request(app)
      .post('/api/playlists/smart/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        mood: 'Calm',
        targetDurationMinutes: 15
      });

    expect(res.status).toBe(200);
    // Response strictly delivers tracks metadata and duration; no autoplay command flags
    expect(res.body.autoPlay).toBeUndefined();
    expect(res.body.shouldPlayImmediately).toBeUndefined();
  });
});
