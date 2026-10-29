import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const ARTWORK_MAP = {
  1: "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/9f/13/ca/9f13ca3b-e533-03e0-f19a-f0aaa774581d/196589311191.jpg/600x600bb.jpg", // Kesariya (Brahmāstra)
  2: "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/bb/23/ee/bb23eeed-0c35-4f1d-2b11-485622777ae4/8902894353007_cover.jpg/600x600bb.jpg", // Tum Hi Ho (Aashiqui 2)
  3: "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/bc/6e/4d/bc6e4d0c-adec-b431-7b60-16f5689f9664/886446201597.jpg/600x600bb.jpg", // Channa Mereya (Ae Dil Hai Mushkil)
  4: "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/62/d6/74/62d67432-0670-631f-db6a-d4bac3adae4b/8902894353328_cover.jpg/600x600bb.jpg", // Badtameez Dil (Yeh Jawaani Hai Deewani)
  5: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/c3/df/e7/c3dfe71e-d532-458e-9c1c-32d40f8d9123/886449472222.jpg/600x600bb.jpg", // Raataan Lambiyan (Shershaah)
  6: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/26/a3/ac/26a3ac64-69e4-95ec-447a-c3fcbbba5bf2/197188730999.jpg/600x600bb.jpg", // Brown Munde
  7: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/a2/e5/d3/a2e5d31f-23bf-d5de-fc91-039c97f4fa11/5054526557672_1.jpg/600x600bb.jpg", // Amplifier (Unforgettable)
  8: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/f4/0b/88/f40b88d5-75cb-27b8-6a5d-4f9e6144e548/886447990476.jpg/600x600bb.jpg", // Ghungroo (War)
  9: "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/cb/ac/67/cbac673a-9213-7118-29cb-64ea98858b16/886445585643.jpg/600x600bb.jpg", // Agar Tum Saath Ho (Tamasha)
  10: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/a7/46/2f/a7462f7e-6dde-b235-ef7f-0bc07e28b804/5054526848244_1.jpg/600x600bb.jpg", // Baarishein (Anuv Jain)
  11: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/90/71/1f/90711f6b-e1b6-7835-263a-bbce50aa6203/8902894625296_cover.jpg/600x600bb.jpg", // Lag Ja Gale (Woh Kaun Thi)
  12: "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/18/2c/fd/182cfdb1-c27a-8d41-c2ff-c7d9539308a0/8902894625517_cover.jpg/600x600bb.jpg", // Pal Pal Dil Ke Paas (Blackmail)
  13: "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/eb/ca/25/ebca2596-cd1e-b295-d8cf-9a91176b970a/886443265219.jpg/600x600bb.jpg", // Someone Like You (21 - Adele)
  14: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/cb/7b/a9/cb7ba903-b5f1-cc21-4f1e-f3f5a11ad261/3700551717209_1.jpg/600x600bb.jpg", // Midnight City (Hurry Up, We're Dreaming)
  15: "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/cc/0b/bd/cc0bbd86-f930-2f01-f25b-bb51375ba95c/00077774618751.rgb.jpg/600x600bb.jpg", // Walking On Sunshine
  16: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/8b/0a/ea/8b0aea60-6f4a-195b-ad71-4aa62cae9dd8/00602527718044.rgb.jpg/600x600bb.jpg", // Bohemian Rhapsody (A Night at the Opera)
  17: "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/9e/ae/4a/9eae4a23-130a-4ed7-94d3-066cb839bfa8/00602527718099.rgb.jpg/600x600bb.jpg", // Don't Stop Me Now (Jazz)
  18: "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/c3/3a/d6/c33ad6a3-ec91-62e4-905c-37e4fb3158bf/5060189710313.jpg/600x600bb.jpg", // Weightless (Marconi Union)
  19: "https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/ef/1d/a5/ef1da57b-d7f9-fc43-c605-1ee2370d65bc/055120211263.png/600x600bb.jpg", // Clair de Lune (Debussy)
  20: "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/87/0e/b1/870eb1eb-da2e-a51b-5e60-f47225c56740/656605218063.jpg/600x600bb.jpg", // Holocene (Bon Iver)
  21: "https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/86/a9/06/86a90685-f3cc-932d-20d4-1a3ebc4149fa/8902894353007.jpg/600x600bb.jpg", // Aashiqui 2 Mashup
  22: null // Restricted track with graceful fallback
};

async function syncAllArtwork() {
  console.log('=== SYNCING OFFICIAL HIGH-RES ALBUM ARTWORK ===');

  // 1. Update frontend/src/utils/mockData.js
  const mockDataPath = path.resolve(__dirname, '../../../frontend/src/utils/mockData.js');
  const { songs } = await import('../../../frontend/src/utils/mockData.js');
  
  const updatedSongs = songs.map(song => {
    const art = ARTWORK_MAP[song.id];
    return {
      ...song,
      cover: art || song.cover,
      albumArt: art || song.albumArt || song.cover
    };
  });

  const fileContent = `export const songs = ${JSON.stringify(updatedSongs, null, 2)};\n`;
  fs.writeFileSync(mockDataPath, fileContent, 'utf8');
  console.log(`Updated ${updatedSongs.length} songs in mockData.js`);

  // 2. Update MongoDB database
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.collection('songs');
    
    let updatedCount = 0;
    for (const song of updatedSongs) {
      const art = ARTWORK_MAP[song.id];
      if (art) {
        const res = await db.updateOne(
          { title: song.title, artist: song.artist },
          { $set: { albumArt: art, cover: art } }
        );
        if (res.modifiedCount > 0) updatedCount++;
      }
    }
    console.log(`Updated ${updatedCount} song records in MongoDB with official album artwork`);
    await mongoose.disconnect();
  }

  console.log('Artwork synchronization complete!');
}

syncAllArtwork().catch(err => {
  console.error('Error during artwork sync:', err);
  process.exit(1);
});
