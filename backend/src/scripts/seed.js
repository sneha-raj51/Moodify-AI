import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB } from '../config/db.js';
import Song from '../models/Song.js';
import { songs as mockSongs } from '../../../frontend/src/utils/mockData.js';

dotenv.config();

const seedDatabase = async () => {
  try {
    await connectDB();
    
    let inserted = 0;
    let updated = 0;
    
    for (const song of mockSongs) {
      const songData = {
        title: song.title,
        artist: song.artist,
        album: song.album || 'Single',
        genre: song.genre || 'Pop',
        mood: song.mood || (song.moods && song.moods[0]) || 'Neutral',
        moods: song.moods || (song.mood ? [song.mood] : ['Neutral']),
        albumArt: song.cover,
        audioUrl: song.audioUrl || null,
        previewUrl: song.previewUrl || song.audioUrl || null,
        youtubeId: song.youtubeId || null,
        duration: song.duration || 240,
        language: song.language || null,
        provider: song.youtubeId ? 'youtube' : 'mongodb',
        playbackType: song.youtubeId ? 'full' : (song.audioUrl ? 'preview' : 'none'),
        isPlayable: Boolean(song.youtubeId || song.audioUrl),
        externalUrl: song.externalUrl || (song.youtubeId ? `https://www.youtube.com/watch?v=${song.youtubeId}` : null)
      };
      
      const result = await Song.updateOne(
        { title: song.title, artist: song.artist },
        { $set: songData },
        { upsert: true }
      );
      
      if (result.upsertedCount > 0) {
        inserted++;
      } else if (result.modifiedCount > 0) {
        updated++;
      }
    }
    
    console.log(`Seeding complete. Inserted: ${inserted}, Updated: ${updated}, Total Songs in Seed: ${mockSongs.length}`);
    
    mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error(`Error during seeding: ${error.message}`);
    process.exit(1);
  }
};

seedDatabase();
