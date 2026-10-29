import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { connectTestDB, closeTestDB, clearTestDB } from './db.js';
import Song from '../src/models/Song.js';
import { normalizeAudiusTrack, searchAudiusTracks } from '../src/services/audiusService.js';
import { normalizeJamendoTrack, searchJamendoByQuery, searchJamendoTracks } from '../src/services/jamendoService.js';
import * as audiusService from '../src/services/audiusService.js';
import * as itunesService from '../src/services/itunesService.js';
import * as jamendoService from '../src/services/jamendoService.js';

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await closeTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  vi.restoreAllMocks();
});

describe('Option C: Hybrid Music Playback & Providers Integration', () => {

  // =========================================================================
  // 1. AUDIUS ADAPTER TESTS
  // =========================================================================
  describe('Audius Music Provider Adapter', () => {
    it('should normalize a valid Audius track into standard Moodify schema with Full Track labels', () => {
      const rawAudiusTrack = {
        id: 'D7KyV',
        title: 'Sunset Horizon',
        user: { name: 'Luna Sol', handle: 'lunasol' },
        duration: 215,
        genre: 'Electronic',
        mood: 'Calm',
        artwork: {
          '480x480': 'https://audius-discovery.com/art/480.jpg'
        },
        stream: {
          url: 'https://audius-content.com/tracks/D7KyV/stream'
        },
        permalink: '/lunasol/sunset-horizon',
        license: 'All Rights Reserved',
        is_streamable: true,
        is_stream_gated: false,
        is_delete: false
      };

      const normalized = normalizeAudiusTrack(rawAudiusTrack);

      expect(normalized).not.toBeNull();
      expect(normalized.id).toBe('audius_D7KyV');
      expect(normalized.title).toBe('Sunset Horizon');
      expect(normalized.artist).toBe('Luna Sol');
      expect(normalized.duration).toBe(215);
      expect(normalized.isPlayable).toBe(true);
      expect(normalized.isPreview).toBe(false);
      expect(normalized.isFullAudio).toBe(true);
      expect(normalized.playbackType).toBe('full');
      expect(normalized.previewLabel).toBe('Full Track');
      expect(normalized.sourceLabel).toBe('Audius');
      expect(normalized.provider).toBe('audius');
      expect(normalized.audioUrl).toBe('https://audius-content.com/tracks/D7KyV/stream');
      expect(normalized.albumArt).toBe('https://audius-discovery.com/art/480.jpg');
    });

    it('should fall back to standard stream endpoint if track.stream.url is not pre-populated', () => {
      const rawAudiusTrack = {
        id: '98765',
        title: 'Lofi Midnight',
        user: { name: 'ChillBeatMaker' },
        duration: 180,
        is_streamable: true,
        is_stream_gated: false,
        is_delete: false
      };

      const normalized = normalizeAudiusTrack(rawAudiusTrack);
      expect(normalized).not.toBeNull();
      expect(normalized.audioUrl).toContain('https://api.audius.co/v1/tracks/98765/stream');
      expect(normalized.audioUrl).toContain('app_name=');
    });

    it('should reject deleted, stream-gated, or unstreamable Audius tracks', () => {
      const deletedTrack = { id: 'del_1', title: 'Deleted Track', is_delete: true };
      const gatedTrack = { id: 'gate_1', title: 'Gated Track', is_stream_gated: true };
      const unstreamableTrack = { id: 'unstream_1', title: 'Unstreamable Track', is_streamable: false };

      expect(normalizeAudiusTrack(deletedTrack)).toBeNull();
      expect(normalizeAudiusTrack(gatedTrack)).toBeNull();
      expect(normalizeAudiusTrack(unstreamableTrack)).toBeNull();
      expect(normalizeAudiusTrack(null)).toBeNull();
      expect(normalizeAudiusTrack({})).toBeNull();
    });

    it('should handle Audius network failure gracefully without throwing', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Audius cluster unreachable'));

      const results = await searchAudiusTracks({ query: 'ambient', limit: 5 });
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });
  });

  // =========================================================================
  // 2. JAMENDO ADAPTER TESTS
  // =========================================================================
  describe('Jamendo Music Provider Adapter', () => {
    it('should normalize a valid Jamendo track with Creative Commons license metadata', () => {
      const rawJamendoTrack = {
        id: '123456',
        name: 'Acoustic Morning',
        artist_name: 'David Acoustic',
        album_name: 'Sunrise Vol 1',
        image: 'https://imgjam.com/art.jpg',
        audio: 'https://prod-1.storage.jamendo.com/download/track/123456/mp32/',
        duration: 240,
        license_ccurl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/'
      };

      const normalized = normalizeJamendoTrack(rawJamendoTrack, 'Calm');

      expect(normalized).not.toBeNull();
      expect(normalized.id).toBe('jamendo_123456');
      expect(normalized.title).toBe('Acoustic Morning');
      expect(normalized.artist).toBe('David Acoustic');
      expect(normalized.duration).toBe(240);
      expect(normalized.isPlayable).toBe(true);
      expect(normalized.isPreview).toBe(false);
      expect(normalized.isFullAudio).toBe(true);
      expect(normalized.playbackType).toBe('full');
      expect(normalized.previewLabel).toBe('Full Track');
      expect(normalized.sourceLabel).toBe('Jamendo');
      expect(normalized.provider).toBe('jamendo');
      expect(normalized.license).toBe('https://creativecommons.org/licenses/by-nc-sa/4.0/');
    });

    it('should gracefully return empty array when JAMENDO_CLIENT_ID is not configured in searchJamendoByQuery', async () => {
      const originalClientId = process.env.JAMENDO_CLIENT_ID;
      delete process.env.JAMENDO_CLIENT_ID;

      try {
        const results = await searchJamendoByQuery('chillout', 5);
        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBe(0);
      } finally {
        if (originalClientId) process.env.JAMENDO_CLIENT_ID = originalClientId;
      }
    });
  });

  // =========================================================================
  // 3. ITUNES PREVIEW INTEGRATION TESTS
  // =========================================================================
  describe('iTunes 30-Second Preview Preservation', () => {
    it('should preserve genuine 30-second audio previews with accurate labels in search API', async () => {
      // Mock iTunes service response
      vi.spyOn(itunesService, 'searchItunesByQuery').mockResolvedValue([
        {
          _id: 'itunes_112233',
          id: 'itunes_112233',
          title: 'Official Pop Anthem',
          artist: 'Global Superstar',
          album: 'Greatest Hits',
          albumArt: 'https://mzstatic.com/art.jpg',
          audioUrl: 'https://audio-ssl.itunes.apple.com/preview/pop.m4a',
          previewUrl: 'https://audio-ssl.itunes.apple.com/preview/pop.m4a',
          isPlayable: true,
          isPreview: true,
          isFullAudio: false,
          playbackType: 'preview',
          duration: 30,
          genre: 'Pop',
          language: 'English',
          provider: 'itunes',
          previewLabel: '30-sec Preview',
          sourceLabel: 'iTunes'
        }
      ]);

      const res = await request(app).get('/api/songs/search?q=Global%20Superstar');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      const itunesSong = res.body.find(s => s.provider === 'itunes');
      expect(itunesSong).toBeDefined();
      expect(itunesSong.isPreview).toBe(true);
      expect(itunesSong.isFullAudio).toBe(false);
      expect(itunesSong.duration).toBe(30);
      expect(itunesSong.previewLabel).toBe('30-sec Preview');
      expect(itunesSong.sourceLabel).toBe('iTunes');
      expect(itunesSong.playbackType).toBe('preview');
    });
  });

  // =========================================================================
  // 4. HYBRID DEDUPLICATION ACROSS PROVIDERS
  // =========================================================================
  describe('Hybrid Deduplication Across Providers', () => {
    it('should eliminate duplicate tracks when a song exists in MongoDB and external providers', async () => {
      // Seed local MongoDB song
      await Song.create({
        title: 'Perfect Echoes',
        artist: 'The Harmonizers',
        album: 'Acoustic Session',
        duration: 30,
        isPlayable: true,
        playbackType: 'preview',
        audioUrl: 'https://example.com/audio/perfect-echoes.m4a',
        previewUrl: 'https://example.com/audio/perfect-echoes.m4a'
      });

      // Mock iTunes returning the same track
      vi.spyOn(itunesService, 'searchItunesByQuery').mockResolvedValue([
        {
          _id: 'itunes_echoes_1',
          id: 'itunes_echoes_1',
          title: 'Perfect Echoes (Official Audio)',
          artist: 'The Harmonizers',
          album: 'Acoustic Session',
          albumArt: 'https://mzstatic.com/echoes.jpg',
          audioUrl: 'https://audio-ssl.itunes.apple.com/preview/echoes.m4a',
          previewUrl: 'https://audio-ssl.itunes.apple.com/preview/echoes.m4a',
          isPlayable: true,
          duration: 30,
          provider: 'itunes'
        }
      ]);

      const res = await request(app).get('/api/songs/search?q=Harmonizers');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      // Verify that the duplicate track was consolidated to exactly 1 result
      const matches = res.body.filter(s => s.artist.toLowerCase().includes('harmonizers'));
      expect(matches.length).toBe(1);
    });
  });

  // =========================================================================
  // 5. PROVIDER CONFIGURATION ENDPOINT
  // =========================================================================
  describe('Provider Configuration API (/api/config/providers)', () => {
    it('should return provider status and capability flags without exposing private keys', async () => {
      const res = await request(app).get('/api/config/providers');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('providers');

      const { itunes, audius, jamendo } = res.body.providers;

      // iTunes config
      expect(itunes).toBeDefined();
      expect(itunes.name).toBe('iTunes Search API');
      expect(itunes.available).toBe(true);
      expect(itunes.type).toBe('preview');
      expect(itunes.durationSeconds).toBe(30);

      // Audius config
      expect(audius).toBeDefined();
      expect(audius.name).toBe('Audius Protocol');
      expect(audius.available).toBe(true);
      expect(audius.type).toBe('full');

      // Jamendo config
      expect(jamendo).toBeDefined();
      expect(jamendo.name).toBe('Jamendo Music API');
      expect(jamendo.type).toBe('full');
      expect(typeof jamendo.available).toBe('boolean');

      // Ensure no secrets/keys are exposed in payload
      const jsonString = JSON.stringify(res.body);
      expect(jsonString).not.toContain('secret');
      expect(jsonString).not.toContain('JAMENDO_CLIENT_ID');
      expect(jsonString).not.toContain('JWT_SECRET');
    });
  });

});
