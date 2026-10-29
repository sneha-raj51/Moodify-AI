import mongoose from 'mongoose';
import Favorite from '../models/Favorite.js';
import Song from '../models/Song.js';

export const getFavorites = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const favorites = await Favorite.find({ userId: req.user.id });
    
    // Manually populate MongoDB songs
    const mongoIds = favorites.filter(f => !f.externalData).map(f => f.songId);
    const mongoSongs = await Song.find({ _id: { $in: mongoIds } });
    const songMap = new Map(mongoSongs.map(s => [s._id.toString(), s]));

    const populatedFavorites = favorites.map(fav => {
      const favObj = fav.toObject();
      if (fav.externalData) {
        const ext = typeof fav.externalData === 'object' ? { ...fav.externalData } : { id: fav.songId };
        const unifiedId = ext._id || ext.id || fav.songId;
        ext._id = unifiedId;
        ext.id = unifiedId;
        return { ...favObj, songId: ext, rawSongId: fav.songId };
      } else {
        const matchedSong = songMap.get(fav.songId);
        const songData = matchedSong ? matchedSong.toObject() : fav.songId;
        return { ...favObj, songId: songData, rawSongId: fav.songId };
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

    if (!externalData) {
      // Must be a local MongoDB song
      if (!mongoose.Types.ObjectId.isValid(songId)) {
        return res.status(400).json({ message: 'Valid MongoDB Song ID is required for local songs' });
      }
      const songExists = await Song.findById(songId);
      if (!songExists) {
        return res.status(404).json({ message: 'Song not found' });
      }
    }

    // Check if already favorited by this user (safe idempotent action)
    const existing = await Favorite.findOne({ userId: req.user.id, songId: String(songId) });
    if (existing) {
      return res.status(200).json(existing);
    }

    const payload = {
      userId: req.user.id,
      songId: String(songId),
      externalData: externalData || null
    };

    const favorite = await Favorite.create(payload);
    res.status(201).json(favorite);
  } catch (error) {
    if (error.code === 11000) {
      const existing = await Favorite.findOne({ userId: req.user.id, songId: String(req.body.songId) });
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

    // Support deletion by Favorite _id OR by songId, strictly scoped to current user
    const isMongoId = mongoose.Types.ObjectId.isValid(id);
    const query = {
      userId: req.user.id,
      $or: [
        ...(isMongoId ? [{ _id: id }] : []),
        { songId: String(id) }
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
