

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { connectTestDB, closeTestDB, clearTestDB } from './db.js';
import Song from '../src/models/Song.js';
import * as itunesService from '../src/services/itunesService.js';

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await closeTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  vi.restoreAllMocks();

  // Seed sample local songs
  await Song.create([
    {
      title: 'Tum Hi Ho',
      artist: 'Arijit Singh',
      album: 'Aashiqui 2',
      genre: 'Bollywood',
      mood: 'Sad',
      moods: ['Sad', 'Calm'],
      language: 'Hindi',
      isPlayable: true,
      audioUrl: 'https://example.com/audio/tum-hi-ho.m4a',
      previewUrl: 'https://example.com/audio/tum-hi-ho.m4a',
      playbackType: 'preview',
      duration: 30
    },
    {
      title: 'Channa Mereya',
      artist: 'Pritam & Arijit Singh',
      album: 'Ae Dil Hai Mushkil',
      genre: 'Bollywood',
      mood: 'Sad',
      moods: ['Sad'],
      language: 'Hindi',
      isPlayable: true,
      audioUrl: 'https://example.com/audio/channa-mereya.m4a',
      previewUrl: 'https://example.com/audio/channa-mereya.m4a',
      playbackType: 'preview',
      duration: 30
    },
    {
      title: 'Kesariya',
      artist: 'Arijit Singh & Pritam',
      album: 'Brahmastra',
      genre: 'Bollywood',
      mood: 'Happy',
      moods: ['Happy', 'Romantic'],
      language: 'Hindi',
      isPlayable: true,
      audioUrl: 'https://example.com/audio/kesariya.m4a',
      previewUrl: 'https://example.com/audio/kesariya.m4a',
      playbackType: 'preview',
      duration: 30
    },
    {
      title: 'Shape of You',
      artist: 'Ed Sheeran',
      album: 'Divide',
      genre: 'Pop',
      mood: 'Happy',
      moods: ['Happy'],
      language: 'English',
      isPlayable: true,
      audioUrl: 'https://example.com/audio/shape-of-you.m4a',
      previewUrl: 'https://example.com/audio/shape-of-you.m4a',
      playbackType: 'preview',
      duration: 30
    }
  ]);

  // Default iTunes mock returns realistic tracks matching query for fast and isolated test execution
  vi.spyOn(itunesService, 'searchItunesByQuery').mockImplementation(async (query, limit = 20) => {
    const q = (query || '').toLowerCase();
    const tracks = [
      {
        _id: 'itunes_tum_hi_ho',
        id: 'itunes_tum_hi_ho',
        title: 'Tum Hi Ho',
        artist: 'Arijit Singh',
        album: 'Aashiqui 2',
        albumArt: 'https://example.com/art/tum-hi-ho.jpg',
        audioUrl: 'https://example.com/audio/tum-hi-ho.m4a',
        previewUrl: 'https://example.com/audio/tum-hi-ho.m4a',
        isPlayable: true,
        isPreview: true,
        playbackType: 'preview',
        duration: 30,
        genre: 'Bollywood',
        language: 'Hindi',
        provider: 'itunes',
        explanation: 'Verified 30-second official audio preview.'
      },
      {
        _id: 'itunes_channa_mereya',
        id: 'itunes_channa_mereya',
        title: 'Channa Mereya',
        artist: 'Pritam & Arijit Singh',
        album: 'Ae Dil Hai Mushkil',
        albumArt: 'https://example.com/art/channa-mereya.jpg',
        audioUrl: 'https://example.com/audio/channa-mereya.m4a',
        previewUrl: 'https://example.com/audio/channa-mereya.m4a',
        isPlayable: true,
        isPreview: true,
        playbackType: 'preview',
        duration: 30,
        genre: 'Bollywood',
        language: 'Hindi',
        provider: 'itunes',
        explanation: 'Verified 30-second official audio preview.'
      },
      {
        _id: 'itunes_shape_of_you',
        id: 'itunes_shape_of_you',
        title: 'Shape of You',
        artist: 'Ed Sheeran',
        album: 'Divide',
        albumArt: 'https://example.com/art/shape.jpg',
        audioUrl: 'https://example.com/audio/shape.m4a',
        previewUrl: 'https://example.com/audio/shape.m4a',
        isPlayable: true,
        isPreview: true,
        playbackType: 'preview',
        duration: 30,
        genre: 'Pop',
        language: 'English',
        provider: 'itunes',
        explanation: 'Verified 30-second official audio preview.'
      }
    ];

    if (!q) return [];
    return tracks.filter(t => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)).slice(0, limit);
  });
});

describe('Global Music Search & Live Suggestions API', () => {

  it('1. should handle Enter / Form search submission for artist "Arijit Singh"', async () => {
    const res = await request(app).get('/api/songs/search?q=Arijit%20Singh');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    
    // Check that songs matching artist Arijit Singh are returned
    const matchingArtist = res.body.filter(s => s.artist.toLowerCase().includes('arijit'));
    expect(matchingArtist.length).toBeGreaterThan(0);
  });

  it('2. should handle search for partial artist name "Arijit"', async () => {
    const res = await request(app).get('/api/songs/search?q=Arijit');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    const firstSong = res.body[0];
    expect(firstSong.artist.toLowerCase()).toContain('arijit');
  });

  it('3. should handle search for song title "Tum Hi Ho"', async () => {
    const res = await request(app).get('/api/songs/search?q=Tum%20Hi%20Ho');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find(s => s.title.toLowerCase().includes('tum hi ho'));
    expect(found).toBeDefined();
    expect(found.artist).toContain('Arijit Singh');
  });

  it('4. should handle search for song title "Channa Mereya"', async () => {
    const res = await request(app).get('/api/songs/search?q=Channa%20Mereya');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find(s => s.title.toLowerCase().includes('channa mereya'));
    expect(found).toBeDefined();
    expect(found.artist).toContain('Arijit');
  });

  it('5. should provide live suggestions with limit=6', async () => {
    const res = await request(app).get('/api/songs/search?q=Arijit&limit=6');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeLessThanOrEqual(6);
  });

  it('6. should handle empty queries correctly without crashing', async () => {
    const res = await request(app).get('/api/songs/search?q=');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('7. should return empty array when no tracks match a nonsense query', async () => {
    // Mock iTunes service to return empty array for nonsense string
    vi.spyOn(itunesService, 'searchItunesByQuery').mockResolvedValue([]);
    
    const res = await request(app).get('/api/songs/search?q=xyzqwertynotfound999999');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });

  it('8. should handle external API errors gracefully and fall back to database results', async () => {
    // Simulate iTunes service network failure
    vi.spyOn(itunesService, 'searchItunesByQuery').mockRejectedValue(new Error('Network timeout'));

    const res = await request(app).get('/api/songs/search?q=Arijit');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Should still return the seeded local songs for Arijit
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].artist).toContain('Arijit');
  });

  it('9. should correctly mark 30-second previews and transparently specify preview status', async () => {
    const res = await request(app).get('/api/songs/search?q=Tum%20Hi%20Ho');
    expect(res.status).toBe(200);
    const song = res.body[0];
    expect(song.isPreview).toBe(true);
    expect(song.duration).toBe(30);
    expect(song.playbackType).toBe('preview');
    expect(song.isFullAudio).toBe(false);
  });

  it('10. should handle stale query sequencing simulation gracefully', async () => {
    // Simulate sequential requests with varying query length
    const req1 = request(app).get('/api/songs/search?q=Ar');
    const req2 = request(app).get('/api/songs/search?q=Arij');
    const req3 = request(app).get('/api/songs/search?q=Arijit%20Singh');

    const [res1, res2, res3] = await Promise.all([req1, req2, req3]);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res3.status).toBe(200);
    expect(res3.body.some(s => s.artist.toLowerCase().includes('arijit'))).toBe(true);
  });
});
