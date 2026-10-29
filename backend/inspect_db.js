import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function inspect() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Song = mongoose.model('Song', new mongoose.Schema({}, { strict: false }));
  const songs = await Song.find({});
  console.log('Total songs in MongoDB:', songs.length);
  
  const targetTitles = ['Kesariya', 'Tum Hi Ho', 'Channa Mereya', 'Badtameez Dil', 'Raataan Lambiyan', 'Kala Chashma'];
  
  for (const song of songs) {
    const isTarget = targetTitles.some(t => song.title.toLowerCase().includes(t.toLowerCase()));
    if (isTarget || !song.isPlayable) {
      console.log(`- [${song._id}] "${song.title}" by "${song.artist}" | isPlayable: ${song.isPlayable} | type: ${song.playbackType} | YT: ${song.youtubeId} | audioUrl: ${!!song.audioUrl} | lyricsAvailable: ${song.lyricsAvailable}`);
    }
  }

  await mongoose.disconnect();
}

inspect().catch(console.error);
