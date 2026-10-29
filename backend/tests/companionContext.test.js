import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { connectTestDB, closeTestDB, clearTestDB } from './db.js';
import { generateToken } from '../src/middleware/authMiddleware.js';
import User from '../src/models/User.js';
import Song from '../src/models/Song.js';
import Playlist from '../src/models/Playlist.js';
import Favorite from '../src/models/Favorite.js';
import ChatSession from '../src/models/ChatSession.js';
import * as itunesService from '../src/services/itunesService.js';
import * as audiusService from '../src/services/audiusService.js';
import * as jamendoService from '../src/services/jamendoService.js';
import { normalizeTrackKey, fetchCompanionTracks, processCompanionMessage } from '../src/services/companionService.js';

process.env.JWT_SECRET = 'test_secret_key';

let userA, userB;
let tokenA, tokenB;

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await closeTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  vi.restoreAllMocks();
  vi.spyOn(itunesService, 'searchItunesTracks').mockResolvedValue([]);
  vi.spyOn(itunesService, 'searchItunesByQuery').mockResolvedValue([]);
  vi.spyOn(audiusService, 'searchAudiusTracks').mockResolvedValue([]);
  vi.spyOn(jamendoService, 'searchJamendoTracks').mockResolvedValue([]);

  // Create test users
  userA = await User.create({
    name: 'Alice User',
    email: 'alice@example.com',
    passwordHash: 'password123',
    preferences: {
      favoriteGenres: ['Rock'],
      favoriteArtists: ['Queen'],
      energyLevel: 'energetic',
      defaultMood: 'Happy'
    }
  });
  tokenA = generateToken(userA._id);

  userB = await User.create({
    name: 'Bob User',
    email: 'bob@example.com',
    passwordHash: 'password123',
    preferences: {
      favoriteGenres: ['Jazz'],
      energyLevel: 'calm',
      defaultMood: 'Calm'
    }
  });
  tokenB = generateToken(userB._id);

  // Seed sample songs across genres, moods, and languages
  await Song.create([
    {
      title: 'Bohemian Rhapsody',
      artist: 'Queen',
      mood: 'Energetic',
      genre: 'Rock',
      language: 'English',
      duration: 354,
      audioUrl: 'https://example.com/bohemian.mp3',
      isPlayable: true
    },
    {
      title: 'Don\'t Stop Me Now',
      artist: 'Queen',
      mood: 'Happy',
      genre: 'Rock',
      language: 'English',
      duration: 210,
      audioUrl: 'https://example.com/dontstop.mp3',
      isPlayable: true
    },
    {
      title: 'We Will Rock You',
      artist: 'Queen',
      mood: 'Energetic',
      genre: 'Rock',
      language: 'English',
      duration: 122,
      audioUrl: 'https://example.com/wewillrockyou.mp3',
      isPlayable: true
    },
    {
      title: 'Under Pressure',
      artist: 'Queen & David Bowie',
      mood: 'Happy',
      genre: 'Rock',
      language: 'English',
      duration: 248,
      audioUrl: 'https://example.com/underpressure.mp3',
      isPlayable: true
    },
    // Bollywood Songs
    {
      title: 'Tum Hi Ho',
      artist: 'Arijit Singh',
      mood: 'Sad',
      genre: 'Bollywood',
      language: 'Hindi',
      duration: 262,
      audioUrl: 'https://example.com/tum-hi-ho.mp3',
      isPlayable: true
    },
    {
      title: 'Channa Mereya',
      artist: 'Arijit Singh',
      mood: 'Sad',
      genre: 'Bollywood',
      language: 'Hindi',
      duration: 289,
      audioUrl: 'https://example.com/channa.mp3',
      isPlayable: true
    },
    {
      title: 'Agar Tum Saath Ho',
      artist: 'Alka Yagnik & Arijit Singh',
      mood: 'Sad',
      genre: 'Bollywood',
      language: 'Hindi',
      duration: 341,
      audioUrl: 'https://example.com/agar-tum.mp3',
      isPlayable: true
    },
    {
      title: 'Kabira (Encore)',
      artist: 'Harshdeep Kaur & Arijit Singh',
      mood: 'Sad',
      genre: 'Bollywood',
      language: 'Hindi',
      duration: 251,
      audioUrl: 'https://example.com/kabira-encore.mp3',
      isPlayable: true
    },
    {
      title: 'Kabira',
      artist: 'Tochi Raina & Rekha Bhardwaj',
      mood: 'Calm',
      genre: 'Bollywood',
      language: 'Hindi',
      duration: 223,
      audioUrl: 'https://example.com/kabira.mp3',
      isPlayable: true
    },
    {
      title: 'Badtameez Dil',
      artist: 'Benny Dayal',
      mood: 'Energetic',
      genre: 'Bollywood',
      language: 'Hindi',
      duration: 252,
      audioUrl: 'https://example.com/badtameez.mp3',
      isPlayable: true
    },
    {
      title: 'Gallan Goodiyaan',
      artist: 'Yashita Sharma & Shankar Mahadevan',
      mood: 'Energetic',
      genre: 'Bollywood',
      language: 'Hindi',
      duration: 296,
      audioUrl: 'https://example.com/gallan.mp3',
      isPlayable: true
    },
    {
      title: 'Ilahi',
      artist: 'Arijit Singh',
      mood: 'Happy',
      genre: 'Bollywood',
      language: 'Hindi',
      duration: 229,
      audioUrl: 'https://example.com/ilahi.mp3',
      isPlayable: true
    },
    {
      title: 'Raabta',
      artist: 'Arijit Singh',
      mood: 'Calm',
      genre: 'Bollywood',
      language: 'Hindi',
      duration: 244,
      audioUrl: 'https://example.com/raabta.mp3',
      isPlayable: true
    }
  ]);
});

describe('Feature 3: Context-Aware AI Music Companion Regression Tests', () => {

  // REQUIREMENT A: Genre and language constraints survive relevant follow-up messages
  it('A. Genre and language constraints survive relevant follow-up messages', async () => {
    const sessionRes = await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Constraint Preservation Test' });
    const sessionId = sessionRes.body._id;

    // Turn 1: Explicitly request Rock songs in English
    const turn1 = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: 'I want Rock songs in English' });

    expect(turn1.status).toBe(200);
    expect(turn1.body.session.context.genre).toBe('Rock');
    expect(turn1.body.session.context.language).toBe('English');
    expect(turn1.body.message.recommendations.length).toBeGreaterThan(0);
    turn1.body.message.recommendations.forEach(t => {
      expect(t.genre).toBe('Rock');
    });

    // Turn 2: Follow-up asking for more songs without repeating genre/language
    const turn2 = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: 'Give me more songs' });

    expect(turn2.status).toBe(200);
    // Verified: Constraints survive follow-up
    expect(turn2.body.session.context.genre).toBe('Rock');
    expect(turn2.body.session.context.language).toBe('English');
    turn2.body.message.recommendations.forEach(t => {
      expect(t.genre).toBe('Rock');
    });
  });

  // REQUIREMENT B: "Give me new songs" excludes previously recommended tracks
  it('B. "Give me new songs" excludes previously recommended tracks', async () => {
    const sessionRes = await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Exclusion Test' });
    const sessionId = sessionRes.body._id;

    // Turn 1: Get 2 Bollywood songs
    const turn1 = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: 'Give me 2 Bollywood songs' });

    expect(turn1.status).toBe(200);
    const turn1Recs = turn1.body.message.recommendations;
    expect(turn1Recs.length).toBe(2);
    const firstBatchIds = new Set(turn1Recs.map(t => String(t.id || t._id)));

    // Turn 2: Ask for new songs
    const turn2 = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: 'Give me new songs' });

    expect(turn2.status).toBe(200);
    const turn2Recs = turn2.body.message.recommendations;
    expect(turn2Recs.length).toBeGreaterThan(0);
    // Verified: No previously recommended tracks are returned
    turn2Recs.forEach(t => {
      expect(firstBatchIds.has(String(t.id || t._id))).toBe(false);
    });
  });

  // REQUIREMENT C: "Give me faster songs" changes the energy preference appropriately
  it('C. "Give me faster songs" changes the energy preference appropriately while preserving genre', async () => {
    const sessionRes = await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Energy Shift Test' });
    const sessionId = sessionRes.body._id;

    // Turn 1: Establish Bollywood genre with calm songs
    await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: 'I want calm Bollywood songs' });

    // Turn 2: Follow-up requesting faster songs
    const turn2 = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: 'Give me faster songs' });

    expect(turn2.status).toBe(200);
    expect(turn2.body.session.context.energy).toBe('energetic');
    expect(turn2.body.session.context.currentMood).toBe('Energetic');
    expect(turn2.body.session.context.genre).toBe('Bollywood');
    expect(turn2.body.message.text).toMatch(/tempo|faster|energetic/i);
    expect(turn2.body.action).toBeNull(); // No autoplay
  });

  // REQUIREMENT D: "Something softer" lowers the requested energy while preserving compatible constraints
  it('D. "Something softer" lowers requested energy while preserving compatible genre/language', async () => {
    const sessionRes = await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Softer Shift Test' });
    const sessionId = sessionRes.body._id;

    // Turn 1: Start with energetic Bollywood
    await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: 'Energetic Bollywood songs' });

    // Turn 2: Ask for something softer
    const turn2 = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: 'Something softer' });

    expect(turn2.status).toBe(200);
    expect(turn2.body.session.context.energy).toBe('calm');
    expect(turn2.body.session.context.currentMood).toBe('Calm');
    expect(turn2.body.session.context.genre).toBe('Bollywood');
    expect(turn2.body.message.text).toMatch(/calmer|softer|shaant|sukoon/i);
    expect(turn2.body.action).toBeNull();
  });

  // REQUIREMENT E: "More like the third song" resolves the correct previous track
  it('E. "More like the third song" resolves the correct previous track', async () => {
    const sessionRes = await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Song Reference Test' });
    const sessionId = sessionRes.body._id;

    // Turn 1: Request 4 Bollywood songs
    const turn1 = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: 'Give me 4 Bollywood songs' });

    expect(turn1.status).toBe(200);
    const recs = turn1.body.message.recommendations;
    expect(recs.length).toBeGreaterThanOrEqual(3);
    const thirdSong = recs[2]; // 3rd song (index 2)

    // Turn 2: Ask for more like the third song
    const turn2 = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: 'More like the third song' });

    expect(turn2.status).toBe(200);
    expect(turn2.body.message.text).toContain(thirdSong.title);
    // Verified: The 3rd song itself is excluded from newly recommended tracks
    const newRecs = turn2.body.message.recommendations;
    newRecs.forEach(t => {
      expect(String(t.id || t._id)).not.toBe(String(thirdSong.id || thirdSong._id));
    });
  });

  // REQUIREMENT F: Duplicate tracks from different providers are filtered
  it('F. Duplicate tracks from different providers are filtered via compound title and artist key', () => {
    // Normalization test with annotations stripped
    const trackA = normalizeTrackKey('Channa Mereya (Official Video)', 'Arijit Singh');
    const trackB = normalizeTrackKey('Channa Mereya - Remastered', 'Arijit Singh');
    const trackC = normalizeTrackKey('Channa Mereya [Lyrics]', 'Arijit Singh');

    expect(trackA.key).toBe('channa mereya:::arijit singh');
    expect(trackB.key).toBe('channa mereya:::arijit singh');
    expect(trackC.key).toBe('channa mereya:::arijit singh');
    expect(trackA.key).toBe(trackB.key);
    expect(trackB.key).toBe(trackC.key);
  });

  // REQUIREMENT G: Distinct tracks with similar titles are not incorrectly merged
  it('G. Distinct tracks with similar titles are not incorrectly merged', () => {
    const song1 = normalizeTrackKey('Hello', 'Adele');
    const song2 = normalizeTrackKey('Hello', 'Lionel Richie');
    const song3 = normalizeTrackKey('Photograph', 'Ed Sheeran');
    const song4 = normalizeTrackKey('Photograph (Acoustic)', 'Ed Sheeran');

    expect(song1.key).toBe('hello:::adele');
    expect(song2.key).toBe('hello:::lionel richie');
    expect(song1.key).not.toBe(song2.key); // Distinct artists with same title are NOT merged!

    // Version distinction preserved
    expect(song3.key).not.toBe(song4.key);
  });

  // REQUIREMENT H: Insufficient unique candidates do not cause old songs to be reinserted
  it('H. Insufficient unique candidates do not cause old songs to be reinserted', async () => {
    const sessionRes = await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Catalog Exhaustion Test' });
    const sessionId = sessionRes.body._id;

    // Database only has 4 sad songs. Query all 4.
    const turn1 = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: 'Give me 4 sad Bollywood songs' });

    expect(turn1.status).toBe(200);
    const turn1Tracks = turn1.body.message.recommendations;
    expect(turn1Tracks.length).toBe(4);

    // Query again asking for new sad songs when 0 unique remain
    const turn2 = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: 'Don\'t repeat those, give me new sad songs' });

    expect(turn2.status).toBe(200);
    // Verified: Never reinserts excluded songs via random fallback
    expect(turn2.body.message.recommendations.length).toBe(0);
    expect(turn2.body.message.text).toMatch(/catalog has no further|no further new tracks|aur naye gaane uplabdh nahi hain/i);
  });

  // REQUIREMENT I: Recommendation requests never initiate playback
  it('I. Recommendation requests never initiate playback (action is null or autoplay is false)', async () => {
    const sessionRes = await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'No Autoplay Test' });
    const sessionId = sessionRes.body._id;

    const res = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: 'Recommend energetic songs' });

    expect(res.status).toBe(200);
    expect(res.body.message.recommendations.length).toBeGreaterThan(0);
    // Verified: action is null or does not have autoplay: true
    expect(res.body.action).toBeNull();
  });

  // REQUIREMENT J: Recommendation requests do not interrupt an existing track
  it('J. Recommendation requests do not interrupt an existing track', async () => {
    const sessionRes = await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Preserve Playback Test' });
    const sessionId = sessionRes.body._id;

    const nowPlayingTrack = {
      id: 'current_playing_123',
      title: 'Current Active Track',
      artist: 'Current Artist'
    };

    const res = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        message: 'Give me different songs',
        context: { nowPlaying: nowPlayingTrack }
      });

    expect(res.status).toBe(200);
    // Verified: Does not emit PLAY_SONG or interrupt nowPlaying
    expect(res.body.action).toBeNull();
  });

  // REQUIREMENT K: Explicit Play and Play All actions still work
  it('K. Explicit Play commands work while recommendations remain non-playing', async () => {
    const sessionRes = await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Explicit Play Command Test' });
    const sessionId = sessionRes.body._id;

    // Explicit command: "Play Tum Hi Ho"
    const res = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: 'Play Tum Hi Ho' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBeDefined();
    expect(res.body.action.type).toBe('PLAY_SONG');
    expect(res.body.action.song.title).toMatch(/Tum Hi Ho/i);
  });

  // REQUIREMENT L: Context is not leaked between users or sessions
  it('L. Context is not leaked between users or sessions', async () => {
    // User A session with distinct mood and recommendations
    const sessionA = await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'User A Session' });
    const idA = sessionA.body._id;

    await request(app)
      .post(`/api/chat/sessions/${idA}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: 'I want Rock songs in English' });

    // User B creates session
    const sessionB = await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ title: 'User B Session' });
    const idB = sessionB.body._id;

    // Verify User B's session starts clean without User A's context
    const getB = await request(app)
      .get(`/api/chat/sessions/${idB}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(getB.status).toBe(200);
    expect(getB.body.context?.genre).toBeFalsy();

    // Verify User B cannot access User A's session (Authorization 403)
    const unauthorizedAccess = await request(app)
      .get(`/api/chat/sessions/${idA}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(unauthorizedAccess.status).toBe(403);
  });

  // REQUIREMENT M: Existing playlist and favorite commands continue working
  it('M. Existing playlist, favorite, start over, and ambiguity handling work', async () => {
    const sessionRes = await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Companion Features Test' });
    const sessionId = sessionRes.body._id;

    // 1. Favorite command
    const favRes = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        message: 'Add this song to my favorites',
        context: {
          nowPlaying: {
            id: 'bohemian_123',
            title: 'Bohemian Rhapsody',
            artist: 'Queen'
          }
        }
      });
    expect(favRes.status).toBe(200);
    expect(favRes.body.action?.type).toBe('FAVORITE_SONG');

    // 2. Ambiguity resolution: "Change it" asks clarification without guessing
    const ambigRes = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: 'Change it' });
    expect(ambigRes.status).toBe(200);
    expect(ambigRes.body.message.text).toMatch(/how would you like to change|what vibe are you looking for/i);

    // 3. Start over clears session context without deleting favorites
    const resetRes = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: 'Start over' });
    expect(resetRes.status).toBe(200);
    expect(resetRes.body.session.context.currentMood).toBeNull();
    expect(resetRes.body.session.context.genre).toBeNull();
    // User favorites still exist in database
    const userFavCount = await Favorite.countDocuments({ userId: userA._id });
    expect(userFavCount).toBeGreaterThan(0);
  });

});
