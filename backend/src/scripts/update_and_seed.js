import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB } from '../config/db.js';
import Song from '../models/Song.js';

dotenv.config({ path: '.env' });

const verifiedUrls = {
  "Kesariya": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/38/4c/5c/384c5c8f-3ff8-e457-b2f7-3158ce108649/mzaf_12389299033886433185.plus.aac.p.m4a",
  "Tum Hi Ho": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/3a/8c/9b/3a8c9b0b-2def-750a-f615-1555bf941edf/mzaf_17229496441442805917.plus.aac.p.m4a",
  "Channa Mereya": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/d5/f9/98/d5f998a7-0090-ee2d-03f8-557ad6c5bf65/mzaf_14251357991592637728.plus.aac.p.m4a",
  "Badtameez Dil": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/88/e2/af/88e2af36-3b58-3f34-32c3-d94d3086c8d5/mzaf_15476348080733865142.plus.aac.p.m4a",
  "Raataan Lambiyan": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/99/0c/38/990c381b-0530-8c0d-87a9-18b050b97f0a/mzaf_10418866714500530894.plus.aac.p.m4a",
  "Brown Munde": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/97/74/69/977469be-a9d5-35a7-80ad-ebe12a799ccc/mzaf_804867738726203367.plus.aac.p.m4a",
  "Amplifier": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/c9/07/49/c907498f-72ee-a92d-d35e-b84a294791d4/mzaf_1725919051371720512.plus.aac.p.m4a",
  "Ghungroo": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/d1/90/95/d190958b-cb33-34b6-83d2-4d88b6ff1348/mzaf_8015651280578447253.plus.aac.p.m4a",
  "Agar Tum Saath Ho": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/75/a8/7d/75a87dcc-5b69-795d-7dcc-27d1c728f31f/mzaf_18055325784732588932.plus.aac.p.m4a",
  "Baarishein": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/22/a0/7d/22a07d46-b904-0717-95da-ec335aac6407/mzaf_13582924850644616784.plus.aac.p.m4a",
  "Lag Ja Gale": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/11/51/03/11510357-3791-657e-259e-05b191f0daa7/mzaf_13246530943563045057.plus.aac.p.m4a",
  "Pal Pal Dil Ke Paas": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/9a/6b/20/9a6b2063-8492-9a67-7d85-3c8fedcf425f/mzaf_10296051997391143250.plus.aac.p.m4a",
  "Someone Like You": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/08/22/2e/08222e25-43f5-20e6-a442-b8127ac83368/mzaf_1689070223363740216.plus.aac.p.m4a",
  "Midnight City": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/24/09/79/2409794c-3d5d-af26-580e-7dc00ee4f207/mzaf_369629549966021675.plus.aac.p.m4a",
  "Walking On Sunshine": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/7a/0e/2e/7a0e2e2a-3733-bcb7-aa05-546e58f54d68/mzaf_5264328537712000510.plus.aac.p.m4a",
  "Bohemian Rhapsody": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/17/fc/1e/17fc1eba-946d-84a9-710b-a0e88ea64209/mzaf_3049006317693088799.plus.aac.p.m4a",
  "Don't Stop Me Now": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/4b/d2/85/4bd2852c-81a9-1da0-01df-31b77705830c/mzaf_17036269860840746883.plus.aac.p.m4a",
  "Clair de Lune": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/15/46/73/15467363-865b-aeed-c4e5-8694d2569d4d/mzaf_1449420267995447622.plus.aac.p.m4a",
  "Holocene": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview116/v4/d1/b8/c0/d1b8c0e1-b434-c4f1-70c2-fd4ec26a54e5/mzaf_8421999634197988050.plus.aac.p.m4a",
  "Aashiqui 2 Mashup (30s Preview)": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/a2/47/6f/a2476f75-e904-6909-d841-b35b23d0f876/mzaf_17216191993888710877.plus.aac.p.m4a",
  "Kala Chashma": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/0b/40/3e/0b403e59-7e56-248f-9363-662fa5d4a6d8/mzaf_7321027000281469165.plus.aac.p.m4a"
};

async function updateAndSeed() {
  const mockPath = path.resolve('../frontend/src/utils/mockData.js');
  let content = fs.readFileSync(mockPath, 'utf8');

  // Load existing mockData
  const { songs } = await import('../../../frontend/src/utils/mockData.js');

  const updatedSongs = songs.map(s => {
    if (s.title === 'Record Label Restricted Track') {
      return {
        ...s,
        audioUrl: null,
        previewUrl: null,
        isPlayable: false,
        isPreview: false,
        playbackType: 'none',
        provider: 'restricted'
      };
    }
    if (s.title === 'Weightless') {
      return {
        ...s,
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        previewUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        isPlayable: true,
        isFullAudio: true,
        isPreview: false,
        playbackType: 'full',
        provider: 'full-length'
      };
    }
    const freshUrl = verifiedUrls[s.title];
    if (freshUrl) {
      return {
        ...s,
        audioUrl: freshUrl,
        previewUrl: freshUrl,
        isPlayable: true,
        isPreview: true,
        playbackType: 'preview',
        provider: 'itunes'
      };
    }
    return s;
  });

  // Re-write mockData.js with updatedSongs
  const { featuredPlaylists } = await import('../../../frontend/src/utils/mockData.js');
  const newFileContent = `export const songs = ${JSON.stringify(updatedSongs, null, 2)};\n\nexport const featuredPlaylists = ${JSON.stringify(featuredPlaylists, null, 2)};\n`;
  fs.writeFileSync(mockPath, newFileContent, 'utf8');
  console.log('✓ Updated frontend/src/utils/mockData.js with verified URLs');

  // Connect to DB and re-seed
  await connectDB();
  console.log('✓ Connected to MongoDB');
  await Song.deleteMany({});
  console.log('✓ Cleared stale/duplicate songs in MongoDB');

  const docs = updatedSongs.map(s => ({
    title: s.title,
    artist: s.artist,
    album: s.album || 'Single',
    genre: s.genre || 'Pop',
    mood: s.mood || (s.moods && s.moods[0]) || 'Neutral',
    moods: s.moods || (s.mood ? [s.mood] : ['Neutral']),
    albumArt: s.cover,
    cover: s.cover,
    audioUrl: s.audioUrl || null,
    previewUrl: s.previewUrl || s.audioUrl || null,
    youtubeId: s.youtubeId || null,
    duration: s.isFullAudio ? s.duration : 30, // Official preview duration is 30s
    language: s.language || null,
    provider: s.isFullAudio ? 'full-audio' : (s.audioUrl ? 'itunes' : 'restricted'),
    playbackType: s.isFullAudio ? 'full' : (s.audioUrl ? 'preview' : 'none'),
    isPlayable: Boolean(s.audioUrl),
    isPreview: Boolean(s.audioUrl && !s.isFullAudio),
    isFullAudio: Boolean(s.isFullAudio),
    externalUrl: s.externalUrl || null,
    explanation: s.isFullAudio ? 'Authorized full-length audio stream.' : (s.audioUrl ? 'Verified 30-second official audio preview.' : 'Metadata only (rights restricted).')
  }));

  const inserted = await Song.insertMany(docs);
  console.log(`✓ Inserted ${inserted.length} clean, verified tracks into MongoDB`);

  mongoose.connection.close();
  console.log('Done!');
}

updateAndSeed().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
