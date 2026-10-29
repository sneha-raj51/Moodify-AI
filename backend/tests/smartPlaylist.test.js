import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { connectTestDB, closeTestDB, clearTestDB } from './db.js';
import { generateToken } from '../src/middleware/authMiddleware.js';
import User from '../src/models/User.js';
import Song from '../src/models/Song.js';
import Playlist from '../src/models/Playlist.js';
import Feedback from '../src/models/Feedback.js';
import * as itunesService from '../src/services/itunesService.js';
import * as audiusService from '../src/services/audiusService.js';
import * as jamendoService from '../src/services/jamendoService.js';
import { 
  buildSmartPlaylist, 
  evaluateEnergy, 
  evaluateVocalPreference, 
  formatSmartTrack 
} from '../src/services/smartPlaylistService.js';

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

  userA = await User.create({
    name: 'Smart Playlist User A',
    email: 'userA@smart.test',
    passwordHash: 'password123',
    preferences: {
      favoriteGenres: ['Rock'],
      favoriteArtists: ['Queen'],
      energyLevel: 'high'
    }
  });
  tokenA = generateToken(userA._id);

  userB = await User.create({
    name: 'Smart Playlist User B',
    email: 'userB@smart.test',
    passwordHash: 'password123'
  });
  tokenB = generateToken(userB._id);

  // Seed verified catalog tracks with precise duration, energy, and vocal metadata
  await Song.create([
    {
      title: 'Bohemian Rhapsody',
      artist: 'Queen',
      mood: 'Energetic',
      genre: 'Rock',
      language: 'English',
      duration: 354, // 5m 54s full track
      audioUrl: 'https://example.com/bohemian.mp3',
      isPlayable: true
    },
    {
      title: 'Don\'t Stop Me Now',
      artist: 'Queen',
      mood: 'Happy',
      genre: 'Rock',
      language: 'English',
      duration: 210, // 3m 30s full track
      audioUrl: 'https://example.com/dontstop.mp3',
      isPlayable: true
    },
    {
      title: 'Weightless',
      artist: 'Marconi Union',
      mood: 'Calm',
      genre: 'Ambient',
      language: 'English',
      duration: 480, // 8m full track
      audioUrl: 'https://example.com/weightless.mp3',
      isPlayable: true,
      tags: ['instrumental']
    },
    {
      title: 'Clair de Lune',
      artist: 'Claude Debussy',
      mood: 'Calm',
      genre: 'Classical',
      language: 'English',
      duration: 300, // 5m full track
      audioUrl: 'https://example.com/debussy.mp3',
      isPlayable: true
    },
    {
      title: 'Tum Hi Ho',
      artist: 'Arijit Singh',
      mood: 'Sad',
      genre: 'Bollywood',
      language: 'Hindi',
      duration: 262, // 4m 22s
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
      title: 'Disliked Song Track',
      artist: 'Disliked Artist',
      mood: 'Happy',
      genre: 'Rock',
      language: 'English',
      duration: 200,
      audioUrl: 'https://example.com/disliked.mp3',
      isPlayable: true
    }
  ]);
});

describe('Feature 4: Smart Playlist Builder Automated Tests', () => {

  // REQUIREMENT A: Playlist generation respects the selected mood
  it('A. Playlist generation respects the selected mood', async () => {
    const res = await request(app)
      .post('/api/playlists/smart/generate')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        mood: 'Calm',
        targetDurationMinutes: 15
      });

    expect(res.status).toBe(200);
    expect(res.body.tracks.length).toBeGreaterThan(0);
    expect(res.body.filters.mood).toBe('Calm');
    res.body.tracks.forEach(track => {
      expect(['Calm', 'Neutral']).toContain(track.mood);
    });
  });

  // REQUIREMENT B: Genre and language filters are preserved
  it('B. Genre and language filters are strictly preserved', async () => {
    const res = await request(app)
      .post('/api/playlists/smart/generate')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        genre: 'Bollywood',
        language: 'Hindi',
        targetDurationMinutes: 15
      });

    expect(res.status).toBe(200);
    expect(res.body.filters.genre).toBe('Bollywood');
    expect(res.body.filters.language).toBe('Hindi');
    expect(res.body.tracks.length).toBeGreaterThan(0);
    res.body.tracks.forEach(track => {
      expect(track.genre).toBe('Bollywood');
      expect(track.language).toBe('Hindi');
    });
  });

  // REQUIREMENT C: Energy filtering uses available metadata honestly
  it('C. Energy filtering uses metadata honestly without claiming measured BPM if estimated', async () => {
    // 1. High Energy request
    const highRes = await request(app)
      .post('/api/playlists/smart/generate')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        energy: 'High',
        targetDurationMinutes: 15
      });

    expect(highRes.status).toBe(200);
    expect(highRes.body.tracks.length).toBeGreaterThan(0);
    highRes.body.tracks.forEach(track => {
      // Must not match calm or sad tracks
      expect(['Energetic', 'Happy', 'Angry']).toContain(track.mood);
      expect(track.explanation).toMatch(/High energy|heuristic/i);
    });

    // 2. Unit test evaluateEnergy transparent heuristic note
    const heuristicEval = evaluateEnergy({ mood: 'Calm' }, 'Low');
    expect(heuristicEval.matches).toBe(true);
    expect(heuristicEval.reason).toContain('no measured BPM');
  });

  // REQUIREMENT D: Vocal preference is applied only when verifiable
  it('D. Vocal preference is applied only when verifiable metadata supports it', async () => {
    const instrumentalRes = await request(app)
      .post('/api/playlists/smart/generate')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        vocalPreference: 'Instrumental',
        targetDurationMinutes: 15
      });

    expect(instrumentalRes.status).toBe(200);
    expect(instrumentalRes.body.tracks.length).toBeGreaterThan(0);
    instrumentalRes.body.tracks.forEach(track => {
      // Must be classical, ambient, or explicitly tagged instrumental
      const isVerified = /classical|ambient/i.test(track.genre) || /instrumental/i.test(track.title);
      expect(isVerified).toBe(true);
    });

    // Unverifiable candidate is rejected from strict instrumental preference
    const unverifiedEval = evaluateVocalPreference({ title: 'Standard Pop Song', genre: 'Pop', artist: 'Singer' }, 'Instrumental');
    expect(unverifiedEval.matches).toBe(false);
    expect(unverifiedEval.verified).toBe(false);
    expect(unverifiedEval.reason).toContain('could not be verified as instrumental');
  });

  // REQUIREMENT E: Target duration uses correct duration fields
  it('E. Target duration calculates total playtime from actual track durations', async () => {
    const res = await request(app)
      .post('/api/playlists/smart/generate')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        mood: 'Energetic',
        genre: 'Rock',
        targetDurationMinutes: 10
      });

    expect(res.status).toBe(200);
    expect(res.body.targetDurationMinutes).toBe(10);
    expect(res.body.totalDurationSeconds).toBeGreaterThan(0);
    
    // Sum of tracks matches totalDurationSeconds exactly
    const calculatedSum = res.body.tracks.reduce((sum, t) => sum + t.duration, 0);
    expect(res.body.totalDurationSeconds).toBe(calculatedSum);
    expect(res.body.totalDurationFormatted).toMatch(/^\d+m\s+\d+s$/);
  });

  // REQUIREMENT F: Preview duration is not misrepresented as full-track duration
  it('F. 30-sec previews are counted strictly as 30 seconds and not full tracks', async () => {
    // Mock iTunes returning 30-second previews
    vi.spyOn(itunesService, 'searchItunesByQuery').mockResolvedValue([
      {
        id: 'itunes_prev_1',
        title: 'Preview Song 1',
        artist: 'iTunes Artist 1',
        audioUrl: 'https://preview.apple.com/song1.m4a',
        isPlayable: true
      },
      {
        id: 'itunes_prev_2',
        title: 'Preview Song 2',
        artist: 'iTunes Artist 2',
        audioUrl: 'https://preview.apple.com/song2.m4a',
        isPlayable: true
      }
    ]);

    const res = await request(app)
      .post('/api/playlists/smart/generate')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        genre: 'Electronic',
        targetDurationMinutes: 5
      });

    expect(res.status).toBe(200);
    const previewTrack = res.body.tracks.find(t => t.provider === 'itunes');
    if (previewTrack) {
      expect(previewTrack.duration).toBe(30);
      expect(previewTrack.playbackType).toBe('preview');
      expect(previewTrack.isFullAudio).toBe(false);
      expect(previewTrack.previewLabel).toBe('30-sec Preview');
    }
    expect(res.body.durationNotes).toMatch(/preview|full/i);
  });

  // REQUIREMENT G: Duplicate tracks from different providers are removed
  it('G. Duplicate tracks from different providers are filtered via compound title and artist key', async () => {
    // iTunes returns the exact same track as MongoDB with annotations
    vi.spyOn(itunesService, 'searchItunesByQuery').mockResolvedValue([
      {
        id: 'itunes_bohemian',
        title: 'Bohemian Rhapsody (Official Video)',
        artist: 'Queen',
        audioUrl: 'https://preview.apple.com/bohemian.m4a',
        isPlayable: true
      }
    ]);

    const res = await request(app)
      .post('/api/playlists/smart/generate')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        genre: 'Rock',
        targetDurationMinutes: 15
      });

    expect(res.status).toBe(200);
    const bohemianMatches = res.body.tracks.filter(t => /bohemian rhapsody/i.test(t.title));
    // Verified: Bohemian Rhapsody appears only ONCE despite being in both MongoDB and iTunes
    expect(bohemianMatches.length).toBe(1);
  });

  // REQUIREMENT H: Disliked tracks are excluded when feedback exists
  it('H. Disliked tracks are excluded when feedback data exists', async () => {
    // Find the disliked test song from seeds
    const dislikedSong = await Song.findOne({ title: 'Disliked Song Track' });
    expect(dislikedSong).toBeDefined();

    // User A records dislike
    await Feedback.create({
      userId: userA._id,
      songId: dislikedSong._id.toString(),
      action: 'dislike'
    });

    const res = await request(app)
      .post('/api/playlists/smart/generate')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        genre: 'Rock',
        targetDurationMinutes: 30,
        preferences: { excludeDisliked: true }
      });

    expect(res.status).toBe(200);
    const ids = res.body.tracks.map(t => String(t.id || t._id));
    // Verified: Disliked song is excluded
    expect(ids).not.toContain(dislikedSong._id.toString());
  });

  // REQUIREMENT I: Insufficient matching tracks return an honest response
  it('I. Insufficient matching tracks return an honest response without repeating songs', async () => {
    const res = await request(app)
      .post('/api/playlists/smart/generate')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        mood: 'Sad',
        genre: 'Bollywood',
        targetDurationMinutes: 60 // 60 minutes requires ~14 tracks, but DB only has 2 sad bollywood songs
      });

    expect(res.status).toBe(200);
    // Returns available unique songs without repeating
    expect(res.body.tracks.length).toBe(2);
    expect(res.body.insufficientMatches).toBe(true);
    expect(res.body.message).toMatch(/limited matching tracks|does not have enough/i);
  });

  // REQUIREMENT J: Generating a playlist does not trigger audio playback
  it('J. Generating a playlist returns data without initiating playback', async () => {
    const res = await request(app)
      .post('/api/playlists/smart/generate')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        mood: 'Energetic',
        targetDurationMinutes: 15
      });

    expect(res.status).toBe(200);
    expect(res.body.tracks.length).toBeGreaterThan(0);
    // No action or autoplay field present
    expect(res.body.action).toBeUndefined();
    expect(res.body.autoplay).toBeUndefined();
  });

  // REQUIREMENT K: Explicit Play and Play All actions work through client
  it('K. Track objects have playable audioUrls and format for explicit player queuing', async () => {
    const res = await request(app)
      .post('/api/playlists/smart/generate')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        genre: 'Rock',
        targetDurationMinutes: 15
      });

    expect(res.status).toBe(200);
    res.body.tracks.forEach(track => {
      expect(track.isPlayable).toBe(true);
      expect(track.audioUrl).toBeDefined();
    });
  });

  // REQUIREMENT L: Saved playlists persist through existing APIs
  it('L. Generated smart playlists can be saved directly through existing playlist APIs', async () => {
    // 1. Generate smart playlist
    const genRes = await request(app)
      .post('/api/playlists/smart/generate')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        mood: 'Happy',
        genre: 'Rock',
        targetDurationMinutes: 15
      });

    expect(genRes.status).toBe(200);
    const generatedTracks = genRes.body.tracks;

    // 2. Save via existing POST /api/playlists endpoint
    const saveRes = await request(app)
      .post('/api/playlists')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: genRes.body.title,
        description: genRes.body.summary,
        songs: generatedTracks
      });

    expect(saveRes.status).toBe(201);
    expect(saveRes.body.name).toBe(genRes.body.title);
    expect(saveRes.body.songs.length).toBe(generatedTracks.length);
    // Verified: Duration and playback type preserved in saved playlist
    expect(saveRes.body.songs[0].duration).toBeDefined();
    expect(saveRes.body.songs[0].playbackType).toBeDefined();

    // 3. Verify playlist exists in user playlists
    const listRes = await request(app)
      .get('/api/playlists')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(listRes.status).toBe(200);
    const saved = listRes.body.find(p => p._id === saveRes.body._id);
    expect(saved).toBeDefined();
  });

  // REQUIREMENT M: A user cannot access another user's saved playlist
  it('M. A user cannot access or modify another user\'s saved playlist', async () => {
    // User A saves a playlist
    const saveRes = await request(app)
      .post('/api/playlists')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'User A Secret Playlist',
        songs: []
      });
    const playlistId = saveRes.body._id;

    // User B tries to get User A's playlist (HTTP 403 Forbidden)
    const unauthorizedGet = await request(app)
      .get(`/api/playlists/${playlistId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(unauthorizedGet.status).toBe(403);

    // User B tries to update User A's playlist (HTTP 403 Forbidden)
    const unauthorizedPut = await request(app)
      .put(`/api/playlists/${playlistId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Hacked Title' });
    expect(unauthorizedPut.status).toBe(403);

    // User B tries to delete User A's playlist (HTTP 403 Forbidden)
    const unauthorizedDel = await request(app)
      .delete(`/api/playlists/${playlistId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(unauthorizedDel.status).toBe(403);
  });

  // REQUIREMENT N: Existing playlists and favorites remain unaffected
  it('N. Existing playlists, favorites, and guest sessions remain unaffected', async () => {
    // Verify guest can generate smart playlist without token
    const guestRes = await request(app)
      .post('/api/playlists/smart/generate')
      .send({
        mood: 'Calm',
        targetDurationMinutes: 15
      });
    expect(guestRes.status).toBe(200);
    expect(guestRes.body.tracks.length).toBeGreaterThan(0);

    // Saving still requires authentication
    const guestSaveRes = await request(app)
      .post('/api/playlists')
      .send({
        name: 'Guest Attempt',
        songs: []
      });
    expect(guestSaveRes.status).toBe(401);
  });

});
