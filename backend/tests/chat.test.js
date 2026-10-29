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
import { getLastSentEmailForTesting } from '../src/services/emailService.js';

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

  // Create test songs in MongoDB across moods
  await Song.create([
    // Sad songs
    {
      title: 'Tum Hi Ho',
      artist: 'Arijit Singh',
      mood: 'Sad',
      genre: 'Bollywood',
      language: 'Hindi',
      duration: 262,
      audioUrl: 'https://audio-ssl.itunes.apple.com/preview/tum-hi-ho.m4a',
      isPlayable: true,
      playbackType: 'preview'
    },
    {
      title: 'Channa Mereya',
      artist: 'Arijit Singh',
      mood: 'Sad',
      genre: 'Bollywood',
      language: 'Hindi',
      duration: 289,
      audioUrl: 'https://audio-ssl.itunes.apple.com/preview/channa-mereya.m4a',
      isPlayable: true,
      playbackType: 'preview'
    },
    {
      title: 'Agar Tum Saath Ho',
      artist: 'Alka Yagnik & Arijit Singh',
      mood: 'Sad',
      genre: 'Bollywood',
      language: 'Hindi',
      duration: 341,
      audioUrl: 'https://audio-ssl.itunes.apple.com/preview/agar-tum.m4a',
      isPlayable: true,
      playbackType: 'preview'
    },
    {
      title: 'Kabira (Encore)',
      artist: 'Harshdeep Kaur & Arijit Singh',
      mood: 'Sad',
      genre: 'Bollywood',
      language: 'Hindi',
      duration: 251,
      audioUrl: 'https://audio-ssl.itunes.apple.com/preview/kabira.m4a',
      isPlayable: true,
      playbackType: 'preview'
    },
    // Happy songs
    {
      title: 'Badtameez Dil',
      artist: 'Benny Dayal',
      mood: 'Happy',
      genre: 'Bollywood',
      language: 'Hindi',
      duration: 252,
      audioUrl: 'https://audio-ssl.itunes.apple.com/preview/badtameez-dil.m4a',
      isPlayable: true,
      playbackType: 'preview'
    },
    {
      title: 'Gallan Goodiyaan',
      artist: 'Yashita Sharma & Shankar Mahadevan',
      mood: 'Happy',
      genre: 'Bollywood',
      language: 'Hindi',
      duration: 296,
      audioUrl: 'https://audio-ssl.itunes.apple.com/preview/gallan-goodiyaan.m4a',
      isPlayable: true,
      playbackType: 'preview'
    },
    {
      title: 'London Thumakda',
      artist: 'Labh Janjua & Sonu Kakkar',
      mood: 'Happy',
      genre: 'Bollywood',
      language: 'Hindi',
      duration: 230,
      audioUrl: 'https://audio-ssl.itunes.apple.com/preview/london-thumakda.m4a',
      isPlayable: true,
      playbackType: 'preview'
    },
    {
      title: 'Subha Hone Na De',
      artist: 'Mika Singh & Shefali Alvares',
      mood: 'Happy',
      genre: 'Bollywood',
      language: 'Hindi',
      duration: 288,
      audioUrl: 'https://audio-ssl.itunes.apple.com/preview/subha-hone.m4a',
      isPlayable: true,
      playbackType: 'preview'
    },
    // Energetic songs
    {
      title: 'Kar Gayi Chull',
      artist: 'Badshah & Neha Kakkar',
      mood: 'Energetic',
      genre: 'Bollywood',
      language: 'Hindi',
      duration: 187,
      audioUrl: 'https://audio-ssl.itunes.apple.com/preview/kar-gayi-chull.m4a',
      isPlayable: true,
      playbackType: 'preview'
    },
    {
      title: 'Malhari',
      artist: 'Vishal Dadlani',
      mood: 'Energetic',
      genre: 'Bollywood',
      language: 'Hindi',
      duration: 245,
      audioUrl: 'https://audio-ssl.itunes.apple.com/preview/malhari.m4a',
      isPlayable: true,
      playbackType: 'preview'
    },
    {
      title: 'Zinda Banda',
      artist: 'Anirudh Ravichander',
      mood: 'Energetic',
      genre: 'Bollywood',
      language: 'Hindi',
      duration: 264,
      audioUrl: 'https://audio-ssl.itunes.apple.com/preview/zinda-banda.m4a',
      isPlayable: true,
      playbackType: 'preview'
    },
    {
      title: 'Kala Chashma',
      artist: 'Amar Arshi & Badshah',
      mood: 'Energetic',
      genre: 'Bollywood',
      language: 'Hindi',
      duration: 187,
      audioUrl: 'https://audio-ssl.itunes.apple.com/preview/kala-chashma.m4a',
      isPlayable: true,
      playbackType: 'preview'
    },
    // Calm songs
    {
      title: 'Weightless',
      artist: 'Marconi Union',
      mood: 'Calm',
      genre: 'Ambient',
      language: 'English',
      duration: 372,
      audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
      isPlayable: true,
      playbackType: 'full'
    },
    {
      title: 'Kun Faya Kun',
      artist: 'A.R. Rahman & Javed Ali',
      mood: 'Calm',
      genre: 'Sufi',
      language: 'Hindi',
      duration: 473,
      audioUrl: 'https://audio-ssl.itunes.apple.com/preview/kun-faya-kun.m4a',
      isPlayable: true,
      playbackType: 'preview'
    },
    {
      title: 'Iktara',
      artist: 'Kavita Seth & Amitabh Bhattacharya',
      mood: 'Calm',
      genre: 'Bollywood',
      language: 'Hindi',
      duration: 253,
      audioUrl: 'https://audio-ssl.itunes.apple.com/preview/iktara.m4a',
      isPlayable: true,
      playbackType: 'preview'
    }
  ]);

  // Create User A
  userA = await User.create({
    name: 'User A',
    email: 'userA@moodify.test',
    passwordHash: 'password123'
  });
  tokenA = generateToken(userA._id);

  // Create User B
  userB = await User.create({
    name: 'User B',
    email: 'userB@moodify.test',
    passwordHash: 'password123'
  });
  tokenB = generateToken(userB._id);
});

describe('Moodify AI Companion API & Data Isolation', () => {
  it('should reject unauthenticated access to chat endpoints with 401', async () => {
    const res = await request(app).get('/api/chat/sessions');
    expect(res.status).toBe(401);
  });

  it('should create a new chat session with a welcome message and quick replies', async () => {
    const res = await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'My Music Companion' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('My Music Companion');
    expect(res.body.messages.length).toBe(1);
    expect(res.body.messages[0].role).toBe('assistant');
    expect(res.body.messages[0].quickReplies.length).toBeGreaterThan(0);
  });

  it('should process user messages, recommend real playable songs, and remember context', async () => {
    // 1. Create session
    const sessionRes = await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({});
    const sessionId = sessionRes.body._id;

    // 2. Send mood statement
    const msgRes1 = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: "I'm feeling low today." });

    expect(msgRes1.status).toBe(200);
    expect(msgRes1.body.message.text).toContain('I\'m sorry today has been difficult');
    expect(msgRes1.body.message.quickReplies).toContain('Emotional Bollywood');

    // 3. User chooses Emotional Bollywood
    const msgRes2 = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: 'Emotional Bollywood' });

    expect(msgRes2.status).toBe(200);
    expect(msgRes2.body.message.recommendations.length).toBeGreaterThan(0);
    const firstRec = msgRes2.body.message.recommendations[0];
    expect(firstRec.audioUrl).toBeDefined();
    expect(firstRec.isPlayable).toBe(true);

    // 4. Test conversational playback command
    const msgRes3 = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: 'Play the first song.' });

    expect(msgRes3.status).toBe(200);
    expect(msgRes3.body.action).toBeDefined();
    expect(msgRes3.body.action.type).toBe('PLAY_SONG');
    expect(msgRes3.body.action.song.title).toBe(firstRec.title);
  });

  it('should politely redirect non-music queries according to guardrails', async () => {
    const sessionRes = await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({});
    const sessionId = sessionRes.body._id;

    const res = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: 'Can you write python code to calculate Fibonacci numbers?' });

    expect(res.status).toBe(200);
    expect(res.body.message.text).toContain("I'm Moodify AI, your music companion");
    expect(res.body.message.recommendations.length).toBe(0);
  });

  it('should strictly isolate chat sessions between different users', async () => {
    // User A creates a session
    const sessionResA = await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: "User A's Secret Session" });
    const sessionIdA = sessionResA.body._id;

    // User B tries to view User A's session
    const accessRes = await request(app)
      .get(`/api/chat/sessions/${sessionIdA}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(accessRes.status).toBe(403);

    // User B gets their own sessions list -> User A's session must not be present
    const listResB = await request(app)
      .get('/api/chat/sessions')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(listResB.body.some(s => s._id === sessionIdA)).toBe(false);
  });

  it('should support forgot-password and reset-password flow', async () => {
    // 1. Forgot password
    const forgotRes = await request(app)
      .post('/api/auth/forgot-password')
      .set('x-test-bypass-rate-limit', 'true')
      .send({ email: 'userA@moodify.test' });

    expect(forgotRes.status).toBe(200);
    expect(forgotRes.body.resetToken).toBeUndefined(); // Crucial: no token leakage in HTTP response
    expect(forgotRes.body.message).toMatch(/password reset instructions have been sent/i);

    const sentEmail = getLastSentEmailForTesting();
    expect(sentEmail).toBeDefined();
    expect(sentEmail.to).toBe('usera@moodify.test');
    expect(sentEmail.token).toBeDefined();

    const resetToken = sentEmail.token;

    // 2. Reset password
    const resetRes = await request(app)
      .post('/api/auth/reset-password')
      .set('x-test-bypass-rate-limit', 'true')
      .send({
        email: 'userA@moodify.test',
        token: resetToken,
        newPassword: 'newPassword123'
      });

    expect(resetRes.status).toBe(200);
    expect(resetRes.body.message).toContain('successfully reset');

    // 3. Login with old password fails
    const oldLogin = await request(app)
      .post('/api/auth/login')
      .set('x-test-bypass-rate-limit', 'true')
      .send({ email: 'userA@moodify.test', password: 'password123' });
    expect(oldLogin.status).toBe(401);

    // 4. Login with new password succeeds
    const newLogin = await request(app)
      .post('/api/auth/login')
      .set('x-test-bypass-rate-limit', 'true')
      .send({ email: 'userA@moodify.test', password: 'newPassword123' });
    expect(newLogin.status).toBe(200);
    expect(newLogin.body.token).toBeDefined();
  });

  it('should support multilingual Hindi and Hinglish intent parsing and conversational commands', async () => {
    // 1. Create session
    const sessionRes = await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Hinglish Companion Chat' });
    const sessionId = sessionRes.body._id;

    // 2. Send Hinglish vague low mood statement
    const msgRes1 = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: 'aaj mood kharab hai' });

    expect(msgRes1.status).toBe(200);
    expect(msgRes1.body.message.text).toContain('Mujhe dukh hai ki aaj ka din thoda mushkil raha hai');
    expect(msgRes1.body.message.quickReplies).toContain('Emotional Bollywood');

    // Verify original user message is preserved
    const sessionCheck1 = await request(app)
      .get(`/api/chat/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    const lastUserMsg = sessionCheck1.body.messages.find(m => m.text === 'aaj mood kharab hai');
    expect(lastUserMsg).toBeDefined();
    expect(lastUserMsg.role).toBe('user');

    // 3. Send Hindi/Hinglish artist and mood request: "mujhe arijit singh ke sad gaane sunao"
    const msgRes2 = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: 'mujhe arijit singh ke sad gaane sunao' });

    expect(msgRes2.status).toBe(200);
    expect(msgRes2.body.message.recommendations.length).toBeGreaterThan(0);
    const recommendedArijit = msgRes2.body.message.recommendations[0];
    expect(recommendedArijit.artist).toContain('Arijit Singh');
    expect(recommendedArijit.isPlayable).toBe(true);

    // 4. Send Hinglish playback command: "pehla gaana bajao"
    const msgRes3 = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: 'pehla gaana bajao' });

    expect(msgRes3.status).toBe(200);
    expect(msgRes3.body.action).toBeDefined();
    expect(msgRes3.body.action.type).toBe('PLAY_SONG');
    expect(msgRes3.body.action.song.title).toBe(recommendedArijit.title);

    // 5. Send Hinglish favorite command: "favorite me daalo"
    const msgRes4 = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: 'favorite me daalo' });

    expect(msgRes4.status).toBe(200);
    expect(msgRes4.body.action).toBeDefined();
    expect(msgRes4.body.action.type).toBe('FAVORITE_SONG');
    expect(msgRes4.body.message.text).toContain('favorites list');

    // 6. Test calm request in Hinglish: "kuch sukoon bhare shaant gaane sunao"
    const msgRes5 = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: 'kuch sukoon bhare shaant gaane sunao' });

    expect(msgRes5.status).toBe(200);
    expect(msgRes5.body.message.text).toMatch(/sukoon|shaant|soothing/i);
    expect(msgRes5.body.message.recommendations.length).toBeGreaterThan(0);
  });

  it('1. should generate a 10-song mood-transition playlist with requested progression (Sad -> Happy -> Energetic)', async () => {
    const sessionRes = await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Mood Transition Test' });
    const sessionId = sessionRes.body._id;

    const res = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        message: "I'm feeling sad. Create a 10-song playlist that starts sad, gradually becomes happy, and then energetic."
      });

    expect(res.status).toBe(200);
    expect(res.body.action).toBeDefined();
    expect(res.body.action.type).toBe('QUEUE_PLAYLIST');

    const songs = res.body.action.songs;
    expect(songs.length).toBe(10);
    expect(res.body.message.recommendations.length).toBe(10);

    // Verify all 10 tracks are distinct by ID
    const uniqueIds = new Set(songs.map(s => s.id || s._id));
    expect(uniqueIds.size).toBe(10);

    // Verify emotional progression: Sad -> Happy -> Energetic
    // Tracks 0-3 should be Sad
    expect(songs[0].mood).toBe('Sad');
    expect(songs[1].mood).toBe('Sad');
    // Middle tracks should be Happy
    const happySlice = songs.slice(3, 7);
    expect(happySlice.some(s => s.mood === 'Happy')).toBe(true);
    // Ending tracks should be Energetic
    const energeticSlice = songs.slice(7);
    expect(energeticSlice.some(s => s.mood === 'Energetic')).toBe(true);
  });

  it('2. should persist generated queue to real MongoDB Playlist when commanded to save', async () => {
    const sessionRes = await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Playlist Save Session' });
    const sessionId = sessionRes.body._id;

    // First generate 10-song playlist
    await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        message: "Create a 10-song playlist that starts sad, gradually becomes happy, and then energetic."
      });

    // Now save it as "My Mood Journey"
    const saveRes = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: "Save this playlist as My Mood Journey" });

    expect(saveRes.status).toBe(200);
    expect(saveRes.body.action).toBeDefined();
    expect(saveRes.body.action.type).toBe('PLAYLIST_SAVED');
    expect(saveRes.body.action.playlist.name).toBe('My Mood Journey');
    expect(saveRes.body.message.text).toContain('My Mood Journey');

    // Verify directly in MongoDB for authenticated user A
    const dbPlaylist = await Playlist.findOne({ userId: userA._id, name: 'My Mood Journey' });
    expect(dbPlaylist).toBeDefined();
    expect(dbPlaylist.songs.length).toBe(10);
    expect(dbPlaylist.songs[0].title).toBeDefined();
    expect(dbPlaylist.songs[0].audioUrl).toBeDefined();

    // Verify it appears in the Playlists section API for User A
    const listRes = await request(app)
      .get('/api/playlists')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(listRes.status).toBe(200);
    const found = listRes.body.find(p => p.name === 'My Mood Journey');
    expect(found).toBeDefined();
    expect(found.songs.length).toBe(10);

    // Verify user isolation: User B cannot access User A's playlist
    const userBList = await request(app)
      .get('/api/playlists')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(userBList.body.some(p => p.name === 'My Mood Journey')).toBe(false);
  });

  it('3. should refuse false success message when attempting to save without any tracks', async () => {
    const sessionRes = await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Empty Save Session' });
    const sessionId = sessionRes.body._id;

    const res = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: "Save this playlist" });

    expect(res.status).toBe(200);
    expect(res.body.action).toBeNull();
    expect(res.body.message.text).toMatch(/no songs in your current queue|koi playlist ya queue nahi hai/i);
    expect(res.body.message.text).not.toContain('Saved!');
  });

  it('4. should add and remove current song to/from favorites with MongoDB persistence', async () => {
    const sessionRes = await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Favorites Voice Session' });
    const sessionId = sessionRes.body._id;

    const sampleSong = {
      _id: '65f011112222333344445555',
      id: '65f011112222333344445555',
      title: 'Kesariya',
      artist: 'Arijit Singh',
      audioUrl: 'https://example.com/kesariya.mp3'
    };

    // 1. Add to favorites via voice command with client context
    const addRes = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        message: "Add this song to my favorites",
        context: { nowPlaying: sampleSong }
      });

    expect(addRes.status).toBe(200);
    expect(addRes.body.action).toBeDefined();
    expect(addRes.body.action.type).toBe('FAVORITE_SONG');
    expect(addRes.body.action.isFavorite).toBe(true);

    // Verify MongoDB persistence
    const savedFav = await Favorite.findOne({ userId: userA._id, songId: sampleSong._id });
    expect(savedFav).toBeDefined();
    expect(savedFav.songId).toBe(sampleSong._id);

    // 2. Remove from favorites via voice command
    const removeRes = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        message: "Remove this song from my favorites",
        context: { nowPlaying: sampleSong }
      });

    expect(removeRes.status).toBe(200);
    expect(removeRes.body.action).toBeDefined();
    expect(removeRes.body.action.type).toBe('REMOVE_FAVORITE');
    expect(removeRes.body.action.isFavorite).toBe(false);

    // Verify deleted from MongoDB
    const deletedFav = await Favorite.findOne({ userId: userA._id, songId: sampleSong._id });
    expect(deletedFav).toBeNull();
  });

  it('5. should add song to existing playlist and create new playlist if specified', async () => {
    const sessionRes = await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Playlist Management' });
    const sessionId = sessionRes.body._id;

    // Create an existing playlist
    await Playlist.create({
      userId: userA._id,
      name: 'Chill Vibes',
      songs: []
    });

    const sampleSong = {
      _id: '65f088889999000011112222',
      id: '65f088889999000011112222',
      title: 'Pasoori',
      artist: 'Ali Sethi',
      audioUrl: 'https://example.com/pasoori.mp3'
    };

    // 1. Add to existing playlist
    const addRes1 = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        message: "Add this song to my Chill Vibes playlist",
        context: { nowPlaying: sampleSong }
      });

    expect(addRes1.status).toBe(200);
    expect(addRes1.body.action.type).toBe('SONG_ADDED_TO_PLAYLIST');

    const updatedPl = await Playlist.findOne({ userId: userA._id, name: 'Chill Vibes' });
    expect(updatedPl.songs.length).toBe(1);
    expect(updatedPl.songs[0].title).toBe('Pasoori');

    // 2. Add to a new playlist called "Late Night"
    const addRes2 = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        message: "Add this song to a new playlist called Late Night",
        context: { nowPlaying: sampleSong }
      });

    expect(addRes2.status).toBe(200);
    expect(addRes2.body.action.type).toBe('SONG_ADDED_TO_PLAYLIST');

    const newPl = await Playlist.findOne({ userId: userA._id, name: 'Late Night' });
    expect(newPl).toBeDefined();
    expect(newPl.songs.length).toBe(1);
    expect(newPl.songs[0].title).toBe('Pasoori');
  });

  it('6. should replace/change current song with matching vibe', async () => {
    const sessionRes = await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Song Replacement Session' });
    const sessionId = sessionRes.body._id;

    const currentSong = {
      _id: '65f012345678901234567890',
      id: '65f012345678901234567890',
      title: 'Tum Hi Ho',
      artist: 'Arijit Singh',
      mood: 'Sad'
    };

    const res = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        message: "Change this song",
        context: { nowPlaying: currentSong, currentMood: 'Sad' }
      });

    expect(res.status).toBe(200);
    expect(res.body.action).toBeDefined();
    expect(res.body.action.type).toBe('REPLACE_CURRENT_SONG');
    expect(res.body.action.song).toBeDefined();
    expect(res.body.action.song.title).not.toBe('Tum Hi Ho');
  });

  it('7. should execute deterministic playback controls (Pause, Resume, Next, Previous)', async () => {
    const sessionRes = await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Playback Control Session' });
    const sessionId = sessionRes.body._id;

    // Pause
    const pauseRes = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: "pause the music" });
    expect(pauseRes.body.action.type).toBe('PAUSE');

    // Resume
    const resumeRes = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: "resume playback" });
    expect(resumeRes.body.action.type).toBe('RESUME');

    // Skip / Next
    const nextRes = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: "skip this song" });
    expect(nextRes.body.action.type).toBe('PLAY_NEXT');

    // Previous
    const prevRes = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: "previous song" });
    expect(prevRes.body.action.type).toBe('PLAY_PREVIOUS');
  });

  it('8. should trigger clarification for ambiguous requests', async () => {
    const sessionRes = await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Ambiguity Test' });
    const sessionId = sessionRes.body._id;

    // Ambiguous add without current song or target playlist
    const res = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        message: "Add this song to my playlist",
        context: {}
      });

    expect(res.status).toBe(200);
    expect(res.body.action).toBeNull();
    expect(res.body.message.text).toMatch(/Which song would you like to add/i);
  });

  it('9. should handle Hindi/Hinglish commands identically to English commands', async () => {
    const sessionRes = await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Hinglish Actions' });
    const sessionId = sessionRes.body._id;

    const sampleSong = {
      _id: '65f099998888777766665555',
      id: '65f099998888777766665555',
      title: 'Deva Deva',
      artist: 'Arijit Singh'
    };

    // Hinglish favorite: "is gaane ko favorites mein add kar do"
    const favRes = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        message: "is gaane ko favorites mein add kar do",
        context: { nowPlaying: sampleSong }
      });
    expect(favRes.body.action.type).toBe('FAVORITE_SONG');

    // Hinglish pause: "gaana roko"
    const pauseRes = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: "gaana roko" });
    expect(pauseRes.body.action.type).toBe('PAUSE');

    // Hinglish next: "agla gaana chalao"
    const nextRes = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: "agla gaana chalao" });
    expect(nextRes.body.action.type).toBe('PLAY_NEXT');
  });

  describe('FIX 2 & FIX 3: Recommendation History, Favorites, and Playlists UX', () => {
    it('10. should exclude tracks previously returned in the same session when user asks for new songs', async () => {
      const sessionRes = await request(app)
        .post('/api/chat/sessions')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'New Songs Discovery Test' });
      const sessionId = sessionRes.body._id;

      // First request: Ask for 2 energetic songs
      const firstRes = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ message: "Give me two energetic songs" });

      expect(firstRes.status).toBe(200);
      expect(firstRes.body.message.recommendations.length).toBe(2);
      const firstSongTitles = firstRes.body.message.recommendations.map(s => s.title.toLowerCase());

      // Second request: Ask for new songs in the same session
      const secondRes = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ message: "Give me two new songs" });

      expect(secondRes.status).toBe(200);
      expect(secondRes.body.message.recommendations.length).toBeGreaterThan(0);
      const secondSongTitles = secondRes.body.message.recommendations.map(s => s.title.toLowerCase());

      // None of the first songs should appear in the second batch
      for (const title of secondSongTitles) {
        expect(firstSongTitles).not.toContain(title);
      }
    });

    it('11. should deduplicate across sources using stable IDs and normalized title/artist', async () => {
      // Mock iTunes returning a song with modified title formatting like "(From 'Film')"
      vi.spyOn(itunesService, 'searchItunesTracks').mockResolvedValueOnce([
        {
          id: 'itunes_tum_hi_ho',
          title: "Tum Hi Ho (From 'Aashiqui 2')",
          artist: 'Arijit Singh',
          artwork: 'https://example.com/cover.jpg',
          audio_url: 'https://audio.example.com/tum-hi-ho.m4a',
          duration: 262,
          genre: 'Bollywood',
          mood: 'Sad'
        },
        {
          id: 'itunes_unique_1',
          title: 'Unique Discovery Track',
          artist: 'New Discovery Artist',
          artwork: 'https://example.com/cover2.jpg',
          audio_url: 'https://audio.example.com/unique.m4a',
          duration: 210,
          genre: 'Bollywood',
          mood: 'Sad'
        }
      ]);

      const sessionRes = await request(app)
        .post('/api/chat/sessions')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Deduplication Test' });
      const sessionId = sessionRes.body._id;

      const res = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ message: "Give me five sad songs" });

      expect(res.status).toBe(200);
      const titles = res.body.message.recommendations.map(s => s.title.toLowerCase());
      // Tum Hi Ho should only be included once
      const tumHiHoMatches = titles.filter(t => t.includes('tum hi ho'));
      expect(tumHiHoMatches.length).toBeLessThanOrEqual(1);
    });

    it('12. should honestly report partial results when fewer new tracks exist in the catalog', async () => {
      const sessionRes = await request(app)
        .post('/api/chat/sessions')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Honest Count Test' });
      const sessionId = sessionRes.body._id;

      // Ask for 15 Ambient Calm songs when only 1 exists in DB and iTunes returns none
      const res = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ message: "Give me 15 ambient calm songs" });

      expect(res.status).toBe(200);
      const recs = res.body.message.recommendations;
      // Should not claim 15 songs were found
      expect(recs.length).toBeLessThan(15);
      if (recs.length < 15) {
        expect(res.body.message.text).toMatch(new RegExp(`Found ${recs.length} new song|catalog has no further`, 'i'));
      }
    });

    it('13. should distinguish singular "Play my favorite song" from plural "Play my favorites"', async () => {
      // Find two real songs in DB to add to favorites
      const songs = await Song.find().limit(2);
      expect(songs.length).toBe(2);

      // Add two favorites for User A with timestamps
      await Favorite.create({
        userId: userA._id,
        songId: String(songs[0]._id),
        createdAt: new Date(Date.now() - 10000)
      });
      await Favorite.create({
        userId: userA._id,
        songId: String(songs[1]._id),
        createdAt: new Date()
      });

      const sessionRes = await request(app)
        .post('/api/chat/sessions')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Favorites Intent Disambiguation' });
      const sessionId = sessionRes.body._id;

      // Singular command: "Play my favorite song"
      const singleRes = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ message: "Play my favorite song" });

      expect(singleRes.status).toBe(200);
      expect(singleRes.body.action).toBeDefined();
      expect(singleRes.body.action.type).toBe('PLAY_SONG');
      expect(singleRes.body.action.song.title).toBe(songs[1].title);

      // Plural command: "Play my favorites"
      const pluralRes = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ message: "Play my favorites" });

      expect(pluralRes.status).toBe(200);
      expect(pluralRes.body.action).toBeDefined();
      expect(pluralRes.body.action.type).toBe('QUEUE_PLAYLIST');
      expect(pluralRes.body.action.title).toBe('My Favorites');
      expect(pluralRes.body.action.songs.length).toBe(2);
    });

    it('14. should list user favorites with "Show me my favorites"', async () => {
      const song = await Song.findOne();
      await Favorite.create({
        userId: userA._id,
        songId: String(song._id)
      });

      const sessionRes = await request(app)
        .post('/api/chat/sessions')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'List Favorites Test' });
      const sessionId = sessionRes.body._id;

      const res = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ message: "Show me my favorites" });

      expect(res.status).toBe(200);
      expect(res.body.action.type).toBe('FAVORITES_LISTED');
      expect(res.body.message.text).toContain(song.title);
    });

    it('15. should list playlists and play named playlist with "Play my Chill playlist"', async () => {
      const dbSongs = await Song.find().limit(2);
      const playlist = await Playlist.create({
        userId: userA._id,
        name: 'Chill Evening',
        songs: dbSongs.map(s => ({
          id: String(s._id),
          title: s.title,
          artist: s.artist,
          audioUrl: s.audioUrl,
          isPlayable: true
        }))
      });

      const sessionRes = await request(app)
        .post('/api/chat/sessions')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Playlist Intent Test' });
      const sessionId = sessionRes.body._id;

      // List playlists
      const listRes = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ message: "Show me my playlists" });

      expect(listRes.status).toBe(200);
      expect(listRes.body.action.type).toBe('PLAYLISTS_LISTED');
      expect(listRes.body.action.playlists.length).toBe(1);

      // Play named playlist: "Play my Chill Evening playlist"
      const playRes = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ message: "Play my Chill Evening playlist" });

      expect(playRes.status).toBe(200);
      expect(playRes.body.action.type).toBe('QUEUE_PLAYLIST');
      expect(playRes.body.action.title).toBe('Chill Evening');
      expect(playRes.body.action.songs.length).toBe(2);
    });

    it('16. should handle ordinal playlist selection ("Play the second playlist")', async () => {
      const dbSongs = await Song.find().limit(2);
      await Playlist.create({
        userId: userA._id,
        name: 'First Playlist',
        songs: [{ id: String(dbSongs[0]._id), title: dbSongs[0].title, artist: dbSongs[0].artist, isPlayable: true }],
        updatedAt: new Date(Date.now() - 5000)
      });
      await Playlist.create({
        userId: userA._id,
        name: 'Second Playlist',
        songs: [{ id: String(dbSongs[1]._id), title: dbSongs[1].title, artist: dbSongs[1].artist, isPlayable: true }],
        updatedAt: new Date()
      });

      const sessionRes = await request(app)
        .post('/api/chat/sessions')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Ordinal Playlist Test' });
      const sessionId = sessionRes.body._id;

      const res = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ message: "Play the second playlist" });

      expect(res.status).toBe(200);
      expect(res.body.action.type).toBe('QUEUE_PLAYLIST');
      expect(res.body.action.title).toBe('First Playlist'); // Sorted updatedAt: -1, so 2nd is First Playlist
    });

    it('17. should clarify ambiguous playlists and explain empty playlists gracefully', async () => {
      const song = await Song.findOne();
      // Two playlists matching "Study"
      await Playlist.create({
        userId: userA._id,
        name: 'Study Focus',
        songs: [{ id: String(song._id), title: song.title, artist: song.artist, isPlayable: true }]
      });
      await Playlist.create({
        userId: userA._id,
        name: 'Study Chill',
        songs: [{ id: String(song._id), title: song.title, artist: song.artist, isPlayable: true }]
      });
      // Empty playlist
      await Playlist.create({
        userId: userA._id,
        name: 'Empty Playlist',
        songs: []
      });

      const sessionRes = await request(app)
        .post('/api/chat/sessions')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Ambiguous & Empty Playlist Test' });
      const sessionId = sessionRes.body._id;

      // Ambiguous: "Play my Study playlist"
      const ambigRes = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ message: "Play my Study playlist" });

      expect(ambigRes.status).toBe(200);
      expect(ambigRes.body.action).toBeNull();
      expect(ambigRes.body.message.text).toMatch(/multiple playlists matching/i);

      // Empty: "Play my Empty Playlist playlist"
      const emptyRes = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ message: "Play my Empty Playlist playlist" });

      expect(emptyRes.status).toBe(200);
      expect(emptyRes.body.action).toBeNull();
      expect(emptyRes.body.message.text).toMatch(/contains no playable tracks/i);
    });

    it('18. should strictly isolate playlists and favorites across users', async () => {
      const song = await Song.findOne();
      // User A creates private playlist and favorite
      await Playlist.create({
        userId: userA._id,
        name: 'Secret User A Mix',
        songs: [{ id: String(song._id), title: song.title, artist: song.artist, isPlayable: true }]
      });
      await Favorite.create({
        userId: userA._id,
        songId: String(song._id)
      });

      // User B tries to play User A's playlist
      const sessionB = await request(app)
        .post('/api/chat/sessions')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ title: 'Isolation Test' });

      const playRes = await request(app)
        .post(`/api/chat/sessions/${sessionB.body._id}/messages`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ message: "Play my Secret User A Mix playlist" });

      expect(playRes.status).toBe(200);
      // User B does not have this playlist
      expect(playRes.body.action).toBeNull();
      expect(playRes.body.message.text).toMatch(/couldn't find a playlist/i);

      // User B tries to play favorites when they have none
      const favRes = await request(app)
        .post(`/api/chat/sessions/${sessionB.body._id}/messages`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ message: "Play my favorite song" });

      expect(favRes.status).toBe(200);
      expect(favRes.body.action).toBeNull();
      expect(favRes.body.message.text).toMatch(/don't have any saved favorite songs/i);
    });
  });

  describe('BUG 1 & BUG 2: Music Autoplay & Repeated Songs Fixes', () => {
    it('BUG 1: recommendation query must NEVER return an autoplay action', async () => {
      const sessionRes = await request(app)
        .post('/api/chat/sessions')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'No Autoplay Test' });
      const sessionId = sessionRes.body._id;

      const res = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ message: "Recommend some energetic songs" });

      expect(res.status).toBe(200);
      expect(res.body.message.recommendations.length).toBeGreaterThan(0);
      // Crucial: action must be null so that client does NOT start autoplay or replace nowPlaying
      expect(res.body.action).toBeNull();
    });

    it('BUG 1: mood transition playlist generation sets autoplay: false', async () => {
      const sessionRes = await request(app)
        .post('/api/chat/sessions')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Playlist Generation No Autoplay' });
      const sessionId = sessionRes.body._id;

      const res = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          message: "Create a 6-song playlist that starts sad and becomes energetic"
        });

      expect(res.status).toBe(200);
      expect(res.body.action).toBeDefined();
      expect(res.body.action.type).toBe('QUEUE_PLAYLIST');
      expect(res.body.action.autoplay).toBe(false);
    });

    it('BUG 1: explicit playback commands (first song, specific song, favorites, playlist) still start playback', async () => {
      const sessionRes = await request(app)
        .post('/api/chat/sessions')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Explicit Play Test' });
      const sessionId = sessionRes.body._id;

      // 1. Play specific song by title "Play Tum Hi Ho"
      const specificRes = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ message: "Play Tum Hi Ho" });

      expect(specificRes.status).toBe(200);
      expect(specificRes.body.action).toBeDefined();
      expect(specificRes.body.action.type).toBe('PLAY_SONG');
      expect(specificRes.body.action.song.title).toBe('Tum Hi Ho');

      // 2. Play first song from recommendations
      const firstRes = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          message: "Play the first song",
          context: { lastRecommendedSongs: [{ id: 's1', title: 'Song One', artist: 'Artist One' }] }
        });

      expect(firstRes.status).toBe(200);
      expect(firstRes.body.action).toBeDefined();
      expect(firstRes.body.action.type).toBe('PLAY_SONG');
      expect(firstRes.body.action.song.title).toBe('Song One');

      // 3. Play my favorites has autoplay: true
      const dbSong = await Song.findOne();
      await Favorite.create({ userId: userA._id, songId: String(dbSong._id) });

      const favRes = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ message: "Play my favorites" });

      expect(favRes.status).toBe(200);
      expect(favRes.body.action).toBeDefined();
      expect(favRes.body.action.type).toBe('QUEUE_PLAYLIST');
      expect(favRes.body.action.autoplay).toBe(true);

      // 4. Play named playlist has autoplay: true
      await Playlist.create({
        userId: userA._id,
        name: 'Gym Jams',
        songs: [{ id: 's99', title: 'Power Track', artist: 'Workout Crew' }]
      });

      const plRes = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ message: "Play my Gym Jams playlist" });

      expect(plRes.status).toBe(200);
      expect(plRes.body.action).toBeDefined();
      expect(plRes.body.action.type).toBe('QUEUE_PLAYLIST');
      expect(plRes.body.action.autoplay).toBe(true);
    });

    it('BUG 2: preserves context constraints (fast/energetic) when user asks for new songs and excludes previous tracks', async () => {
      const sessionRes = await request(app)
        .post('/api/chat/sessions')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Context Preservation Test' });
      const sessionId = sessionRes.body._id;

      // Turn 1: "give me fast songs"
      const turn1 = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ message: "Give me fast songs" });

      expect(turn1.status).toBe(200);
      const turn1Tracks = turn1.body.message.recommendations;
      expect(turn1Tracks.length).toBeGreaterThan(0);
      turn1Tracks.forEach(t => {
        expect(t.mood).toBe('Energetic');
      });

      const turn1Ids = new Set(turn1Tracks.map(t => String(t.id || t._id)));

      // Turn 2: "Give me new songs" (follow-up without re-stating "fast")
      const turn2 = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ message: "Give me new songs" });

      expect(turn2.status).toBe(200);
      const turn2Tracks = turn2.body.message.recommendations;
      // Must maintain energetic mood constraint
      turn2Tracks.forEach(t => {
        expect(t.mood).toBe('Energetic');
        // Must NOT repeat any track from Turn 1
        expect(turn1Ids.has(String(t.id || t._id))).toBe(false);
      });
    });

    it('BUG 2: follow-up phrases ("Suggest something else", "Don\'t repeat these", "Aur naye songs do") keep context and avoid duplicates', async () => {
      const sessionRes = await request(app)
        .post('/api/chat/sessions')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Follow-up Phrasing Test' });
      const sessionId = sessionRes.body._id;

      // Turn 1: Start with Happy songs
      const turn1 = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ message: "I want happy songs" });

      expect(turn1.status).toBe(200);
      const turn1Tracks = turn1.body.message.recommendations;
      const seenIds = new Set(turn1Tracks.map(t => String(t.id || t._id)));

      // Turn 2: "Suggest something else"
      const turn2 = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ message: "Suggest something else" });

      expect(turn2.status).toBe(200);
      const turn2Tracks = turn2.body.message.recommendations;
      turn2Tracks.forEach(t => {
        expect(t.mood).toBe('Happy');
        expect(seenIds.has(String(t.id || t._id))).toBe(false);
        seenIds.add(String(t.id || t._id));
      });

      // Turn 3: "Aur naye songs do" (Hindi / Hinglish follow-up)
      const turn3 = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ message: "Aur naye songs do" });

      expect(turn3.status).toBe(200);
      const turn3Tracks = turn3.body.message.recommendations;
      turn3Tracks.forEach(t => {
        expect(t.mood).toBe('Happy');
        expect(seenIds.has(String(t.id || t._id))).toBe(false);
      });
    });

    it('BUG 2: cross-query candidate pools deduplicate overlapping tracks cleanly', async () => {
      // Mock iTunes queries returning duplicate items
      vi.spyOn(itunesService, 'searchItunesByQuery').mockResolvedValue([
        { id: 'dup1', title: 'Duplicate Song', artist: 'Artist X', audioUrl: 'https://example.com/dup.mp3', duration: 180, isPlayable: true },
        { id: 'dup1', title: 'Duplicate Song', artist: 'Artist X', audioUrl: 'https://example.com/dup.mp3', duration: 180, isPlayable: true },
        { id: 'uniq2', title: 'Unique Song', artist: 'Artist Y', audioUrl: 'https://example.com/uniq.mp3', duration: 200, isPlayable: true }
      ]);

      const sessionRes = await request(app)
        .post('/api/chat/sessions')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Deduplication Test' });
      const sessionId = sessionRes.body._id;

      const res = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ message: "Recommend EDM songs" });

      expect(res.status).toBe(200);
      const tracks = res.body.message.recommendations;
      const ids = tracks.map(t => String(t.id || t._id));
      const uniqueIds = new Set(ids);
      expect(ids.length).toBe(uniqueIds.size);
    });

    it('BUG 2: when unique tracks are exhausted, honestly explains without repeating previous songs', async () => {
      const sessionRes = await request(app)
        .post('/api/chat/sessions')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Exhausted Tracks Test' });
      const sessionId = sessionRes.body._id;

      // First query gets all 4 sad songs from DB
      const res1 = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ message: "Give me 4 sad songs" });

      expect(res1.status).toBe(200);
      expect(res1.body.message.recommendations.length).toBe(4);

      // Second query requests more sad songs when catalog has 0 left
      const res2 = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ message: "Don't repeat these, give me new sad songs" });

      expect(res2.status).toBe(200);
      expect(res2.body.message.recommendations.length).toBe(0);
      expect(res2.body.message.text).toMatch(/catalog has no further|no further new tracks|aur naye gaane uplabdh nahi hain/i);
    });
  });
});

