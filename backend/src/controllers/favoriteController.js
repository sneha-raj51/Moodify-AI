import mongoose from 'mongoose';
import Favorite from '../models/Favorite.js';
import Song from '../models/Song.js';

export const getFavorites = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const favorites = await Favorite.find({ userId: req.user.id }).sort({ createdAt: -1 });
    
    // Collect all candidate MongoDB song IDs
    const mongoIds = favorites
      .map(f => f.songId)
      .filter(id => id && mongoose.Types.ObjectId.isValid(id));

    const mongoSongs = mongoIds.length > 0 ? await Song.find({ _id: { $in: mongoIds } }) : [];
    const songMap = new Map(mongoSongs.map(s => [s._id.toString(), s]));

    const populatedFavorites = favorites.map(fav => {
      const favObj = fav.toObject();
      const rawId = String(fav.songId);

      if (fav.externalData && typeof fav.externalData === 'object') {
        const ext = { ...fav.externalData };
        const unifiedId = ext._id || ext.id || rawId;
        ext._id = unifiedId;
        ext.id = unifiedId;

        // If local catalogue song exists, backfill any richer catalogue fields
        const matchedSong = songMap.get(rawId);
        if (matchedSong) {
          const cat = matchedSong.toObject();
          return {
            ...favObj,
            songId: { ...cat, ...ext, _id: cat._id.toString(), id: cat._id.toString() },
            rawSongId: rawId
          };
        }

        return { ...favObj, songId: ext, rawSongId: rawId };
      } else {
        const matchedSong = songMap.get(rawId);
        if (matchedSong) {
          return { ...favObj, songId: matchedSong.toObject(), rawSongId: rawId };
        }
        // Fallback placeholder for external track saved with minimal data
        return {
          ...favObj,
          songId: {
            _id: rawId,
            id: rawId,
            title: 'Saved Track',
            artist: 'Unknown Artist',
            isPlayable: true
          },
          rawSongId: rawId
        };
      }
    });

    res.status(200).json(populatedFavorites);
  } catch (error) {
    console.error('getFavorites error:', error.message);
    res.status(500).json({ message: 'Server Error' });
  }
};

export const addFavorite = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { songId, externalData } = req.body;
    
    if (!songId) {
      return res.status(400).json({ message: 'Valid Song ID is required' });
    }

    const idStr = String(songId).trim();

    // Check if song is in MongoDB catalogue
    const isMongoId = mongoose.Types.ObjectId.isValid(idStr);
    let localSong = null;
    if (isMongoId) {
      localSong = await Song.findById(idStr);
    }

    // If no externalData provided and not in catalogue, verify if it's an external ID or invalid
    if (!externalData && !localSong) {
      if (!isMongoId && !idStr.startsWith('itunes_') && !idStr.startsWith('jamendo_') && !/^\d+$/.test(idStr)) {
        return res.status(404).json({ message: 'Song not found' });
      }
    }

    // Check if already favorited by this user (check both with and without itunes_ prefix)
    const idVariants = [idStr];
    if (idStr.startsWith('itunes_')) {
      idVariants.push(idStr.replace(/^itunes_/, ''));
    } else if (/^\d+$/.test(idStr)) {
      idVariants.push(`itunes_${idStr}`);
    }

    const existing = await Favorite.findOne({
      userId: req.user.id,
      songId: { $in: idVariants }
    });

    if (existing) {
      const existingObj = existing.toObject();
      const retSong = localSong
        ? localSong.toObject()
        : (existing.externalData || { _id: idStr, id: idStr, isPlayable: true });
      return res.status(200).json({
        ...existingObj,
        songId: retSong,
        rawSongId: idStr
      });
    }

    // Persist full metadata in externalData for streaming tracks or catalogue snapshot
    const payload = {
      userId: req.user.id,
      songId: idStr,
      externalData: externalData || (localSong ? localSong.toObject() : null)
    };

    const favorite = await Favorite.create(payload);
    const favObj = favorite.toObject();
    const resolvedSongData = externalData || (localSong ? localSong.toObject() : { _id: idStr, id: idStr, isPlayable: true });

    res.status(201).json({
      ...favObj,
      songId: resolvedSongData,
      rawSongId: idStr
    });
  } catch (error) {
    if (error.code === 11000) {
      const existing = await Favorite.findOne({
        userId: req.user.id,
        songId: String(req.body.songId)
      });
      return res.status(200).json(existing);
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Validation Error', details: error.message });
    }
    console.error('addFavorite error:', error.message);
    res.status(500).json({ message: 'Server Error' });
  }
};

export const removeFavorite = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: 'Valid favorite ID or song ID is required' });
    }

    const idStr = String(id).trim();
    const isMongoId = mongoose.Types.ObjectId.isValid(idStr);

    // Build multi-attribute identifier variants for reliable track un-favoriting
    const idVariants = [idStr];
    if (idStr.startsWith('itunes_')) {
      idVariants.push(idStr.replace(/^itunes_/, ''));
    } else if (/^\d+$/.test(idStr)) {
      idVariants.push(`itunes_${idStr}`);
    }

    const query = {
      userId: req.user.id,
      $or: [
        ...(isMongoId ? [{ _id: idStr }] : []),
        { songId: { $in: idVariants } },
        { 'externalData.id': { $in: idVariants } },
        { 'externalData._id': { $in: idVariants } }
      ]
    };

    const favorite = await Favorite.findOneAndDelete(query);
    if (!favorite) {
      return res.status(404).json({ message: 'Favorite not found or access denied' });
    }

    res.status(200).json({ message: 'Favorite removed' });
  } catch (error) {
    console.error('removeFavorite error:', error.message);
    res.status(500).json({ message: 'Server Error' });
  }
};
