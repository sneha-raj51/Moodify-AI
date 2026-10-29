import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { connectTestDB, closeTestDB, clearTestDB } from './db.js';
import { generateToken } from '../src/middleware/authMiddleware.js';
import User from '../src/models/User.js';
import Playlist from '../src/models/Playlist.js';

process.env.JWT_SECRET = 'test_secret_key';

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await closeTestDB();
});

beforeEach(async () => {
  await clearTestDB();
});

describe('Playlist API & Ownership Security', () => {
  let userA, tokenA;
  let userB, tokenB;

  beforeEach(async () => {
    userA = await User.create({ name: 'Alice', email: 'alice@example.com', passwordHash: 'password123' });
    tokenA = generateToken(userA._id);

    userB = await User.create({ name: 'Bob', email: 'bob@example.com', passwordHash: 'password123' });
    tokenB = generateToken(userB._id);
  });

  it('should reject unauthenticated access', async () => {
    const res = await request(app).get('/api/playlists');
    expect(res.status).toBe(401);
  });

  it('should allow user to create a playlist', async () => {
    const res = await request(app)
      .post('/api/playlists')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'My Chill Vibes',
        description: 'Mellow tunes for studying'
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('My Chill Vibes');
    expect(res.body.description).toBe('Mellow tunes for studying');
    expect(res.body.userId).toBe(userA._id.toString());
  });

  it('should allow user to add and remove songs from a playlist', async () => {
    const createRes = await request(app)
      .post('/api/playlists')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Workout Mix' });

    const playlistId = createRes.body._id;

    // Add song
    const addRes = await request(app)
      .post(`/api/playlists/${playlistId}/songs`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        id: 'itunes_12345',
        title: 'Eye of the Tiger',
        artist: 'Survivor',
        cover: 'https://example.com/cover.jpg',
        audioUrl: 'https://example.com/audio.mp3',
        isPlayable: true
      });

    expect(addRes.status).toBe(200);
    expect(addRes.body.songs.length).toBe(1);
    expect(addRes.body.songs[0].title).toBe('Eye of the Tiger');
    expect(addRes.body.coverArt).toBe('https://example.com/cover.jpg');

    // Remove song
    const removeRes = await request(app)
      .delete(`/api/playlists/${playlistId}/songs/itunes_12345`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(removeRes.status).toBe(200);
    expect(removeRes.body.songs.length).toBe(0);
  });

  it('should enforce strict ownership: Bob cannot read or modify Alice playlist', async () => {
    // Alice creates playlist
    const createRes = await request(app)
      .post('/api/playlists')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Alice Private Playlist' });

    const playlistId = createRes.body._id;

    // Bob tries to read it
    const getRes = await request(app)
      .get(`/api/playlists/${playlistId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(getRes.status).toBe(403);

    // Bob tries to update it
    const putRes = await request(app)
      .put(`/api/playlists/${playlistId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Hacked Playlist' });
    expect(putRes.status).toBe(403);

    // Bob tries to add a song to it
    const addRes = await request(app)
      .post(`/api/playlists/${playlistId}/songs`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ id: 'bad_song', title: 'Malicious' });
    expect(addRes.status).toBe(403);

    // Bob tries to delete it
    const deleteRes = await request(app)
      .delete(`/api/playlists/${playlistId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(deleteRes.status).toBe(403);

    // Verify playlist still belongs to Alice untouched
    const verifyPlaylist = await Playlist.findById(playlistId);
    expect(verifyPlaylist.name).toBe('Alice Private Playlist');
  });

  it('should allow owner to delete playlist', async () => {
    const createRes = await request(app)
      .post('/api/playlists')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'To Be Deleted' });

    const deleteRes = await request(app)
      .delete(`/api/playlists/${createRes.body._id}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(deleteRes.status).toBe(200);
    const check = await Playlist.findById(createRes.body._id);
    expect(check).toBeNull();
  });

  describe('Playlist Song Normalization & Shape Robustness', () => {
    it('should normalize songs using id, _id, and songId without discarding metadata', async () => {
      const res = await request(app)
        .post('/api/playlists')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Multi-Shape Playlist',
          description: 'Testing song normalization',
          songs: [
            {
              id: 'shape_id_1',
              title: 'Song With Standard ID',
              artist: 'Artist ID',
              cover: 'https://example.com/art1.jpg',
              audioUrl: 'https://example.com/audio1.mp3',
              isPlayable: true,
              genre: 'Rock',
              mood: 'Energetic'
            },
            {
              _id: 'shape_mongo_2',
              title: 'Song With Mongo _id',
              artist: 'Artist Mongo',
              albumArt: 'https://example.com/art2.jpg',
              audioUrl: 'https://example.com/audio2.mp3',
              isPlayable: true,
              genre: 'Pop',
              mood: 'Happy'
            },
            {
              songId: 'shape_songid_3',
              title: 'Song With songId Field',
              artist: 'Artist SongId',
              cover: 'https://example.com/art3.jpg',
              audioUrl: 'https://example.com/audio3.mp3',
              isPlayable: true,
              genre: 'Jazz',
              mood: 'Calm'
            }
          ]
        });

      expect(res.status).toBe(201);
      expect(res.body.songs.length).toBe(3);

      // Verify song 1 (from 'id')
      expect(res.body.songs[0].id).toBe('shape_id_1');
      expect(res.body.songs[0].title).toBe('Song With Standard ID');
      expect(res.body.songs[0].audioUrl).toBe('https://example.com/audio1.mp3');
      expect(res.body.songs[0].cover).toBe('https://example.com/art1.jpg');
      expect(res.body.songs[0].isPlayable).toBe(true);

      // Verify song 2 (from '_id')
      expect(res.body.songs[1].id).toBe('shape_mongo_2');
      expect(res.body.songs[1].title).toBe('Song With Mongo _id');
      expect(res.body.songs[1].albumArt).toBe('https://example.com/art2.jpg');
      expect(res.body.songs[1].cover).toBe('https://example.com/art2.jpg');
      expect(res.body.songs[1].isPlayable).toBe(true);

      // Verify song 3 (from 'songId')
      expect(res.body.songs[2].id).toBe('shape_songid_3');
      expect(res.body.songs[2].title).toBe('Song With songId Field');
      expect(res.body.songs[2].audioUrl).toBe('https://example.com/audio3.mp3');
      expect(res.body.songs[2].isPlayable).toBe(true);
    });

    it('should allow adding songs with _id or songId later', async () => {
      const createRes = await request(app)
        .post('/api/playlists')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Append Playlist' });

      const playlistId = createRes.body._id;

      const addRes = await request(app)
        .post(`/api/playlists/${playlistId}/songs`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          _id: 'song_added_later',
          title: 'Appended Track',
          artist: 'Appender',
          cover: 'https://example.com/later.jpg',
          audioUrl: 'https://example.com/later.mp3'
        });

      expect(addRes.status).toBe(200);
      expect(addRes.body.songs.length).toBe(1);
      expect(addRes.body.songs[0].id).toBe('song_added_later');
      expect(addRes.body.songs[0].title).toBe('Appended Track');
      expect(addRes.body.songs[0].audioUrl).toBe('https://example.com/later.mp3');
    });

    it('should return 400 when creating a playlist without a name', async () => {
      const res = await request(app)
        .post('/api/playlists')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: '' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Playlist name is required/i);
    });

    it('should return 400 when adding a song without id or title', async () => {
      const createRes = await request(app)
        .post('/api/playlists')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Test Invalid Song' });

      const res = await request(app)
        .post(`/api/playlists/${createRes.body._id}/songs`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ artist: 'Anonymous' }); // missing id and title

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Valid song metadata/i);
    });
  });
});
