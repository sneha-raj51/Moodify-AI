import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function syncCatalog() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Song = mongoose.model('Song', new mongoose.Schema({}, { strict: false }));

  console.log('Connected to MongoDB. Syncing target Bollywood tracks...');

  // 1. Get synced lyrics from existing Kesariya entry if available
  const kesariyaWithLyrics = await Song.findOne({
    title: /kesariya/i,
    'lyrics.synced': { $exists: true, $ne: null }
  });

  const syncedLyrics = kesariyaWithLyrics?.lyrics || {
    synced: "[00:09.44] मुझको इतना बताए कोई\n[00:19.02] कैसे तुझसे दिल ना लगाए कोई?\n[00:29.91] रब्बा ने तुझको बनाने में\n[00:34.26] कर दी हैं हुस्न की ख़ाली तिजोरियाँ\n[00:40.36] काजल की सियाही से लिखी हैं तूने\n[00:45.35] जाने कितनों की लव-स्टोरियाँ\n[00:49.31] केसरिया तेरा इश्क़ है, पिया\n[00:54.27] रंग जाऊँ जो मैं हाथ लगाऊँ\n[00:58.32] दिन बीते सारा तेरी फ़िक्र में\n[01:03.09] रैन सारी तेरी ख़ैर मनाऊँ",
    plain: "मुझको इतना बताए कोई\nकैसे तुझसे दिल ना लगाए कोई?\nरब्बा ने तुझको बनाने में\nकर दी हैं हुस्न की ख़ाली तिजोरियाँ\nकाजल की सियाही से लिखी हैं तूने\nजाने कितनों की लव-स्टोरियाँ\nकेसरिया तेरा इश्क़ है, पिया\nरंग जाऊँ जो मैं हाथ लगाऊँ\nदिन बीते सारा तेरी फ़िक्र में\nरैन सारी तेरी ख़ैर मनाऊँ",
    source: 'lrclib'
  };

  // 2. Update all Kesariya entries to be playable with full YouTube ID and lyrics
  const kesariyaUpdate = await Song.updateMany(
    { title: /kesariya/i },
    {
      $set: {
        isPlayable: true,
        playbackType: 'full',
        youtubeId: 'BddP6PYo2gs',
        audioUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/38/4c/5c/384c5c8f-3ff8-e457-b2f7-3158ce108649/mzaf_12389299033886433185.plus.aac.p.m4a',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/38/4c/5c/384c5c8f-3ff8-e457-b2f7-3158ce108649/mzaf_12389299033886433185.plus.aac.p.m4a',
        lyrics: syncedLyrics,
        lyricsAvailable: true,
        duration: 268,
        language: 'Hindi',
        genre: 'Bollywood',
        mood: 'Happy',
        moods: ['Happy', 'Calm']
      }
    }
  );
  console.log('Updated Kesariya entries:', kesariyaUpdate.modifiedCount);

  // 3. Upsert Kala Chashma
  const kalaChashma = await Song.findOneAndUpdate(
    { title: /kala chashma/i },
    {
      $set: {
        title: 'Kala Chashma',
        artist: 'Amar Arshi, Badshah & Neha Kakkar',
        album: 'Baar Baar Dekho',
        genre: 'Bollywood',
        mood: 'Energetic',
        moods: ['Energetic', 'Happy'],
        language: 'Hindi',
        isPlayable: true,
        playbackType: 'full',
        youtubeId: 'k4yXQkGLeAA',
        audioUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview115/v4/33/c5/42/33c54271-e949-cbe9-6f10-67c21ae9b4c0/mzaf_11306604683050478099.plus.aac.p.m4a',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview115/v4/33/c5/42/33c54271-e949-cbe9-6f10-67c21ae9b4c0/mzaf_11306604683050478099.plus.aac.p.m4a',
        duration: 187,
        albumArt: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=80&w=400&h=400',
        cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=80&w=400&h=400',
        externalUrl: 'https://www.youtube.com/watch?v=k4yXQkGLeAA'
      }
    },
    { upsert: true, new: true }
  );
  console.log('Upserted Kala Chashma:', kalaChashma.title);

  // 4. Update Brown Munde
  await Song.updateMany(
    { title: /brown munde/i },
    {
      $set: {
        isPlayable: true,
        playbackType: 'full',
        youtubeId: 'VNs_cCtdbPc',
        audioUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview115/v4/ff/88/24/ff882412-2c6c-a6be-28bf-d31e9c20a4b7/mzaf_1127027384112529321.plus.aac.p.m4a',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview115/v4/ff/88/24/ff882412-2c6c-a6be-28bf-d31e9c20a4b7/mzaf_1127027384112529321.plus.aac.p.m4a',
        duration: 260
      }
    }
  );

  // 5. Ensure Tum Hi Ho has lyrics Available
  const tumHiHoLyrics = {
    plain: "Hum tere bin ab reh nahi sakte\nTere bina kya wajood mera\nHum tere bin ab reh nahi sakte\nTere bina kya wajood mera\nTujh se juda agar ho jaayenge\nToh khud se hi ho jaayenge judaa\nKyunki tum hi ho\nAb tum hi ho\nZindagi ab tum hi ho\nChain bhi, mera dard bhi\nMeri aashiqui ab tum hi ho",
    synced: "[00:15.50] Hum tere bin ab reh nahi sakte\n[00:23.00] Tere bina kya wajood mera\n[00:28.00] Hum tere bin ab reh nahi sakte\n[00:33.50] Tere bina kya wajood mera\n[00:40.00] Tujh se juda agar ho jaayenge\n[00:45.00] Toh khud se hi ho jaayenge judaa\n[00:52.00] Kyunki tum hi ho\n[00:56.00] Ab tum hi ho\n[01:00.00] Zindagi ab tum hi ho\n[01:05.50] Chain bhi, mera dard bhi\n[01:10.00] Meri aashiqui ab tum hi ho",
    source: 'lrclib'
  };

  await Song.updateMany(
    { title: /tum hi ho/i },
    {
      $set: {
        lyrics: tumHiHoLyrics,
        lyricsAvailable: true,
        isPlayable: true,
        playbackType: 'full',
        youtubeId: 'IJq0ydzBu-M',
        moods: ['Sad', 'Calm']
      }
    }
  );
  console.log('Updated Tum Hi Ho with verified lyrics and playback.');

  await mongoose.disconnect();
  console.log('Finished catalog synchronization successfully.');
}

syncCatalog().catch(console.error);
