import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { connectTestDB, closeTestDB, clearTestDB } from './db.js';
import User from '../src/models/User.js';
import Song from '../src/models/Song.js';
import Feedback from '../src/models/Feedback.js';
import Favorite from '../src/models/Favorite.js';
import History from '../src/models/History.js';
import ChatSession from '../src/models/ChatSession.js';
import { generateToken } from '../src/middleware/authMiddleware.js';
import * as itunesService from '../src/services/itunesService.js';
import * as jamendoService from '../src/services/jamendoService.js';
import * as audiusService from '../src/services/audiusService.js';

process.env.JWT_SECRET = 'test_taste_profile_secret';
process.env.CORS_ORIGIN = 'http://localhost:5173';

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await closeTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  vi.spyOn(itunesService, 'searchItunesTracks').mockResolvedValue([]);
  vi.spyOn(itunesService, 'searchItunesByQuery').mockResolvedValue([]);
  vi.spyOn(jamendoService, 'searchJamendoTracks').mockResolvedValue([]);
  vi.spyOn(audiusService, 'searchAudiusTracks').mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Personal Music Taste Profile Feature (Phase 8 Verifications)', () => {

  it('A: A new user sees an appropriate empty profile', async () => {
    const user = await User.create({
      name: 'New Listener',
      email: 'newuser@moodify.test',
      passwordHash: 'hashed123'
    });
    const token = generateToken(user._id);

    const res = await request(app)
      .get('/api/profile/taste')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.isNewUser).toBe(true);
    expect(res.body.explicit).toBeDefined();
    expect(res.body.explicit.favoriteGenres).toEqual([]);
    expect(res.body.explicit.favoriteArtists).toEqual([]);
    expect(res.body.explicit.energyLevel).toBe('balanced');
    expect(res.body.inferred).toBeDefined();
    expect(res.body.inferred.topGenres).toEqual([]);
    expect(res.body.inferred.topArtists).toEqual([]);
    expect(res.body.inferred.frequentlyLikedTracks).toEqual([]);
    expect(res.body.inferred.frequentlySkippedTracks).toEqual([]);
    expect(res.body.inferred.activityCounts.likesCount).toBe(0);
    expect(res.body.inferred.activityCounts.favoritesCount).toBe(0);
  });

  it('B: A user can save and update music preferences', async () => {
    const user = await User.create({
      name: 'Music Fan',
      email: 'fan@moodify.test',
      passwordHash: 'hashed123'
    });
    const token = generateToken(user._id);

    const updatePayload = {
      favoriteGenres: ['Rock', 'Indie', 'Pop'],
      favoriteArtists: ['Coldplay', 'Arctic Monkeys'],
      energyLevel: 'energetic',
      preferredMoods: ['Happy', 'Energetic'],
      favoriteListeningModes: ['Workout & Gym', 'Chill & Relax'],
      preferredLanguages: ['English']
    };

    const res = await request(app)
      .put('/api/profile/taste')
      .set('Authorization', `Bearer ${token}`)
      .send(updatePayload);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/taste profile updated successfully/i);
    expect(res.body.preferences.favoriteGenres).toEqual(['Rock', 'Indie', 'Pop']);
    expect(res.body.preferences.favoriteArtists).toEqual(['Coldplay', 'Arctic Monkeys']);
    expect(res.body.preferences.energyLevel).toBe('energetic');
    expect(res.body.preferences.preferredMoods).toEqual(['Happy', 'Energetic']);
    expect(res.body.preferences.favoriteListeningModes).toEqual(['workout & gym', 'chill & relax']);
    expect(res.body.preferences.updatedAt).toBeDefined();
  });

  it('C: Favorite genres and artists are persisted correctly in MongoDB', async () => {
    const user = await User.create({
      name: 'Curator',
      email: 'curator@moodify.test',
      passwordHash: 'hashed123',
      preferences: {
        favoriteGenres: ['Bollywood', 'Acoustic'],
        favoriteArtists: ['Arijit Singh'],
        energyLevel: 'calm'
      }
    });
    const token = generateToken(user._id);

    const res = await request(app)
      .get('/api/profile/taste')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.isNewUser).toBe(false);
    expect(res.body.explicit.favoriteGenres).toEqual(['Bollywood', 'Acoustic']);
    expect(res.body.explicit.favoriteArtists).toEqual(['Arijit Singh']);
    expect(res.body.explicit.energyLevel).toBe('calm');

    // Cross-verify directly in database
    const dbUser = await User.findById(user._id);
    expect(dbUser.preferences.favoriteGenres).toEqual(['Bollywood', 'Acoustic']);
    expect(dbUser.preferences.favoriteArtists).toEqual(['Arijit Singh']);
  });

  it('D: Existing feedback signals are reused without duplicate counting', async () => {
    const user = await User.create({
      name: 'Active Listener',
      email: 'active@moodify.test',
      passwordHash: 'hashed123'
    });
    const token = generateToken(user._id);

    const song1 = await Song.create({
      title: 'Fix You',
      artist: 'Coldplay',
      genre: 'Rock',
      mood: 'Calm',
      audioUrl: 'https://example.com/fixyou.mp3'
    });

    const song2 = await Song.create({
      title: 'Yellow',
      artist: 'Coldplay',
      genre: 'Rock',
      mood: 'Happy',
      audioUrl: 'https://example.com/yellow.mp3'
    });

    // Create 1 like feedback for song1
    await Feedback.create({
      userId: user._id,
      songId: song1._id.toString(),
      action: 'like',
      genre: 'Rock',
      artist: 'Coldplay',
      mood: 'Calm'
    });

    // Create 1 like feedback for song2
    await Feedback.create({
      userId: user._id,
      songId: song2._id.toString(),
      action: 'like',
      genre: 'Rock',
      artist: 'Coldplay',
      mood: 'Happy'
    });

    // Also add song1 to favorites (should not duplicate song1 in candidate counts)
    await Favorite.create({
      userId: user._id,
      songId: song1._id.toString()
    });

    // Add 1 skip in feedback
    await Feedback.create({
      userId: user._id,
      songId: song2._id.toString(),
      action: 'skip',
      title: song2.title,
      artist: song2.artist
    });

    const res = await request(app)
      .get('/api/profile/taste')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.inferred.activityCounts.likesCount).toBe(2);
    expect(res.body.inferred.activityCounts.favoritesCount).toBe(1);
    expect(res.body.inferred.activityCounts.skipsCount).toBe(1);

    // Verify top artist Coldplay is aggregated legitimately
    const topArtist = res.body.inferred.topArtists.find(a => a.artist === 'Coldplay');
    expect(topArtist).toBeDefined();

    // Verify reset negative signals clears skips and dislikes but preserves favorites and likes
    const resetRes = await request(app)
      .post('/api/profile/taste/reset-inferred')
      .set('Authorization', `Bearer ${token}`);

    expect(resetRes.status).toBe(200);
    expect(resetRes.body.message).toMatch(/reset/i);

    // Skips should be 0, while favorites and likes remain
    const resAfterReset = await request(app)
      .get('/api/profile/taste')
      .set('Authorization', `Bearer ${token}`);

    expect(resAfterReset.body.inferred.activityCounts.skipsCount).toBe(0);
    expect(resAfterReset.body.inferred.activityCounts.likesCount).toBe(2);
    expect(resAfterReset.body.inferred.activityCounts.favoritesCount).toBe(1);
  });

  it('E: Explicit preferences affect recommendations when relevant', async () => {
    const user = await User.create({
      name: 'Rock Lover',
      email: 'rocker@moodify.test',
      passwordHash: 'hashed123',
      preferences: {
        favoriteGenres: ['Rock'],
        favoriteArtists: ['The Beatles'],
        energyLevel: 'energetic'
      }
    });
    const token = generateToken(user._id);

    // Create candidate catalog
    await Song.create({
      title: 'Rock Anthem',
      artist: 'The Beatles',
      genre: 'Rock',
      mood: 'Happy',
      audioUrl: 'https://example.com/rock.mp3'
    });

    await Song.create({
      title: 'Smooth Jazz Afternoon',
      artist: 'Miles Davis',
      genre: 'Jazz',
      mood: 'Happy',
      audioUrl: 'https://example.com/jazz.mp3'
    });

    const res = await request(app)
      .post('/api/ai/recommend')
      .set('Authorization', `Bearer ${token}`)
      .send({ mood: 'Happy' });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.recommendations)).toBe(true);
    expect(res.body.recommendations.length).toBeGreaterThan(0);

    // First recommendation should be the Rock track matching user's stored taste profile
    const first = res.body.recommendations[0];
    expect(first.title).toBe('Rock Anthem');
    expect(first.score).toBeGreaterThan(1.0);
    // Explanations should cite actual contributing factors
    expect(first.reasons.some(r => r.includes('Rock') || r.includes('Beatles') || r.includes('energy'))).toBe(true);
  });

  it('F: Existing mood-based recommendations continue to work', async () => {
    await Song.create({
      title: 'Sunny Day',
      artist: 'Joy Band',
      genre: 'Pop',
      mood: 'Happy',
      audioUrl: 'https://example.com/sunny.mp3'
    });

    await Song.create({
      title: 'Rainy Blues',
      artist: 'Sad Band',
      genre: 'Blues',
      mood: 'Sad',
      audioUrl: 'https://example.com/rainy.mp3'
    });

    const res = await request(app)
      .post('/api/ai/recommend')
      .send({ mood: 'Happy' });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.recommendations)).toBe(true);
    const happyMatch = res.body.recommendations.find(s => s.title === 'Sunny Day');
    expect(happyMatch).toBeDefined();
    expect(happyMatch.reasons.some(r => r.includes('Happy'))).toBe(true);
  });

  it('G: Explicit user requests are not overridden by the profile', async () => {
    // User profile preference is Rock
    const user = await User.create({
      name: 'Rock Lover Override',
      email: 'rockoverride@moodify.test',
      passwordHash: 'hashed123',
      preferences: {
        favoriteGenres: ['Rock']
      }
    });
    const token = generateToken(user._id);

    await Song.create({
      title: 'Rock Song',
      artist: 'Rocker',
      genre: 'Rock',
      mood: 'Happy',
      audioUrl: 'https://example.com/rock.mp3'
    });

    await Song.create({
      title: 'Classical Symphony',
      artist: 'Mozart',
      genre: 'Classical',
      mood: 'Happy',
      audioUrl: 'https://example.com/classical.mp3'
    });

    // Request explicitly passes favoriteGenres: ['Classical']
    const res = await request(app)
      .post('/api/ai/recommend')
      .set('Authorization', `Bearer ${token}`)
      .send({
        mood: 'Happy',
        favoriteGenres: ['Classical']
      });

    expect(res.status).toBe(200);
    // The explicit request for Classical must rank higher than the profile's Rock
    const first = res.body.recommendations[0];
    expect(first.title).toBe('Classical Symphony');
    expect(first.genre).toBe('Classical');
  });

  it('H: Disliked tracks are handled according to existing recommendation policy', async () => {
    const user = await User.create({
      name: 'Feedback Tester',
      email: 'feedbacktester@moodify.test',
      passwordHash: 'hashed123'
    });
    const token = generateToken(user._id);

    const dislikedSong = await Song.create({
      title: 'Unwanted Song',
      artist: 'Unknown',
      genre: 'Pop',
      mood: 'Happy',
      audioUrl: 'https://example.com/unwanted.mp3'
    });

    const likedSong = await Song.create({
      title: 'Beloved Song',
      artist: 'Star',
      genre: 'Pop',
      mood: 'Happy',
      audioUrl: 'https://example.com/beloved.mp3'
    });

    // Record dislike
    await Feedback.create({
      userId: user._id,
      songId: dislikedSong._id.toString(),
      action: 'dislike'
    });

    const res = await request(app)
      .post('/api/ai/recommend')
      .set('Authorization', `Bearer ${token}`)
      .send({ mood: 'Happy' });

    expect(res.status).toBe(200);
    const ids = res.body.recommendations.map(s => String(s.id || s._id));
    expect(ids).not.toContain(dislikedSong._id.toString());
    expect(ids).toContain(likedSong._id.toString());
  });

  it("I: One user cannot access another user's taste profile", async () => {
    const user1 = await User.create({
      name: 'User One',
      email: 'user1@moodify.test',
      passwordHash: 'hashed123',
      preferences: { favoriteGenres: ['Jazz'] }
    });

    const user2 = await User.create({
      name: 'User Two',
      email: 'user2@moodify.test',
      passwordHash: 'hashed123',
      preferences: { favoriteGenres: ['Metal'] }
    });

    const token1 = generateToken(user1._id);

    // User 1 requests their profile
    const res1 = await request(app)
      .get('/api/profile/taste')
      .set('Authorization', `Bearer ${token1}`);

    expect(res1.status).toBe(200);
    expect(res1.body.explicit.favoriteGenres).toEqual(['Jazz']);
    expect(res1.body.explicit.favoriteGenres).not.toContain('Metal');

    // Unauthenticated request fails with 401
    const unauthRes = await request(app).get('/api/profile/taste');
    expect(unauthRes.status).toBe(401);
  });

  it('J: Missing or incomplete metadata does not crash recommendation generation', async () => {
    // Create song with missing optional fields
    await Song.create({
      title: 'Incomplete Track',
      artist: 'Ghost Artist'
      // genre, mood, artwork, duration omitted
    });

    await Song.create({
      title: 'Valid Track',
      artist: 'Known Artist',
      genre: 'Acoustic',
      mood: 'Calm',
      audioUrl: 'https://example.com/audio.mp3'
    });

    const res = await request(app)
      .post('/api/ai/recommend')
      .send({ mood: 'Calm' });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.recommendations)).toBe(true);
  });

  it('K: Companion cannot update preferences without explicit user intent', async () => {
    const user = await User.create({
      name: 'Chatter',
      email: 'chatter@moodify.test',
      passwordHash: 'hashed123',
      preferences: {
        favoriteGenres: ['Pop'],
        energyLevel: 'calm'
      }
    });
    const token = generateToken(user._id);

    // Create chat session
    const sessionRes = await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'My Chat' });

    const sessionId = sessionRes.body._id;

    // 1. Regular recommendation request must NOT alter preferences
    const recChatRes = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Recommend me some happy music' });

    expect(recChatRes.status).toBe(200);
    let dbUser = await User.findById(user._id);
    expect(dbUser.preferences.energyLevel).toBe('calm');
    expect(dbUser.preferences.favoriteGenres).toEqual(['Pop']);

    // 2. Explicit request: "I prefer energetic music" MUST update energyLevel
    const explicitEnergyRes = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'I prefer energetic music' });

    expect(explicitEnergyRes.status).toBe(200);
    dbUser = await User.findById(user._id);
    expect(dbUser.preferences.energyLevel).toBe('energetic');

    // 3. Explicit request: "Update my preferred genres to Rock, Indie" MUST update genres
    const explicitGenresRes = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Update my preferred genres to Rock, Indie' });

    expect(explicitGenresRes.status).toBe(200);
    dbUser = await User.findById(user._id);
    expect(dbUser.preferences.favoriteGenres).toEqual(['Rock', 'Indie']);
  }, 15000);

});
