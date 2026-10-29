import mongoose from 'mongoose';
import Playlist from '../models/Playlist.js';
import User from '../models/User.js';
import { buildSmartPlaylist } from '../services/smartPlaylistService.js';

/**
 * Get all playlists for current user
 */
export const getUserPlaylists = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Authentication required to access cloud playlists' });
    }
    const playlists = await Playlist.find({ userId: req.user.id }).sort({ updatedAt: -1 });
    res.status(200).json(playlists);
  } catch (error) {
    console.error('getUserPlaylists error:', error.message);
    res.status(500).json({ message: 'Server error retrieving playlists' });
  }
};

/**
 * Get single playlist by ID (enforcing ownership)
 */
export const getPlaylistById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid playlist ID format' });
    }

    const playlist = await Playlist.findById(id);
    if (!playlist) {
      return res.status(404).json({ message: 'Playlist not found' });
    }

    // Ownership check
    if (!req.user || playlist.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied to this playlist' });
    }

    res.status(200).json(playlist);
  } catch (error) {
    console.error('getPlaylistById error:', error.message);
    res.status(500).json({ message: 'Server error retrieving playlist' });
  }
};

/**
 * Create a new playlist
 */
export const normalizePlaylistSong = (song) => {
  if (!song || typeof song !== 'object') return null;
  const rawId = song.id || song._id || song.songId;
  if (!rawId || !song.title) return null;

  const artwork = song.cover || song.albumArt || null;
  const rawDuration = typeof song.duration === 'number' && song.duration > 0 ? Math.round(song.duration) : 30;
  const isFull = Boolean(song.isFullAudio || song.playbackType === 'full' || (rawDuration > 60 && song.source !== 'itunes'));
  const provider = song.source || song.provider || 'mongodb';

  return {
    id: String(rawId),
    title: String(song.title).trim(),
    artist: song.artist ? String(song.artist).trim() : 'Unknown Artist',
    albumArt: artwork,
    cover: artwork,
    audioUrl: song.audioUrl || song.previewUrl || null,
    isPlayable: Boolean(song.audioUrl || song.previewUrl || song.isPlayable),
    duration: rawDuration,
    playbackType: isFull ? 'full' : 'preview',
    isFullAudio: isFull,
    previewLabel: song.previewLabel || (isFull ? 'Full Track' : '30-sec Preview'),
    sourceLabel: song.sourceLabel || (provider === 'audius' ? 'Audius' : (provider === 'jamendo' ? 'Jamendo' : (provider === 'itunes' ? 'iTunes' : 'Moodify'))),
    explanation: song.explanation || '',
    genre: song.genre || null,
    mood: song.mood || null,
    language: song.language || null,
    source: provider,
    addedAt: song.addedAt ? new Date(song.addedAt) : new Date()
  };
};

export const createPlaylist = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Authentication required to create cloud playlists' });
    }

    const { name, description = '', coverArt, songs = [] } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Playlist name is required' });
    }

    const normalizedSongs = [];
    const seenIds = new Set();
    if (Array.isArray(songs)) {
      for (const s of songs) {
        const norm = normalizePlaylistSong(s);
        if (norm && !seenIds.has(norm.id)) {
          seenIds.add(norm.id);
          normalizedSongs.push(norm);
        }
      }
    }

    const derivedCoverArt = coverArt || (normalizedSongs.length > 0 ? normalizedSongs[0].cover : '');

    const playlist = await Playlist.create({
      userId: req.user.id,
      name: name.trim(),
      description: description.trim(),
      coverArt: derivedCoverArt,
      songs: normalizedSongs
    });

    res.status(201).json(playlist);
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Validation Error', details: error.message });
    }
    console.error('createPlaylist error:', error.message);
    res.status(500).json({ message: 'Server error creating playlist' });
  }
};

/**
 * Update/rename playlist
 */
export const updatePlaylist = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid playlist ID format' });
    }

    const playlist = await Playlist.findById(id);
    if (!playlist) {
      return res.status(404).json({ message: 'Playlist not found' });
    }

    if (!req.user || playlist.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied: cannot modify another user\'s playlist' });
    }

    const { name, description, coverArt } = req.body;
    if (name !== undefined) playlist.name = name.trim();
    if (description !== undefined) playlist.description = description.trim();
    if (coverArt !== undefined) playlist.coverArt = coverArt;

    await playlist.save();
    res.status(200).json(playlist);
  } catch (error) {
    console.error('updatePlaylist error:', error.message);
    res.status(500).json({ message: 'Server error updating playlist' });
  }
};

/**
 * Delete a playlist
 */
export const deletePlaylist = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid playlist ID format' });
    }

    const playlist = await Playlist.findById(id);
    if (!playlist) {
      return res.status(404).json({ message: 'Playlist not found' });
    }

    if (!req.user || playlist.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied: cannot delete another user\'s playlist' });
    }

    await Playlist.findByIdAndDelete(id);
    res.status(200).json({ message: 'Playlist deleted successfully' });
  } catch (error) {
    console.error('deletePlaylist error:', error.message);
    res.status(500).json({ message: 'Server error deleting playlist' });
  }
};

/**
 * Add a song to playlist
 */
export const addSongToPlaylist = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid playlist ID format' });
    }

    const playlist = await Playlist.findById(id);
    if (!playlist) {
      return res.status(404).json({ message: 'Playlist not found' });
    }

    if (!req.user || playlist.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied: cannot modify another user\'s playlist' });
    }

    const norm = normalizePlaylistSong(req.body);
    if (!norm) {
      return res.status(400).json({ message: 'Valid song metadata (id and title) is required' });
    }

    // Check if song already exists in playlist
    const existingIndex = playlist.songs.findIndex(s => s.id === norm.id);
    if (existingIndex >= 0) {
      return res.status(400).json({ message: 'Song is already in this playlist' });
    }

    playlist.songs.push(norm);

    // If playlist had no cover, use first song cover
    if (!playlist.coverArt && norm.cover) {
      playlist.coverArt = norm.cover;
    }

    await playlist.save();
    res.status(200).json(playlist);
  } catch (error) {
    console.error('addSongToPlaylist error:', error.message);
    res.status(500).json({ message: 'Server error adding song to playlist' });
  }
};

/**
 * Remove a song from playlist
 */
export const removeSongFromPlaylist = async (req, res) => {
  try {
    const { id, songId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid playlist ID format' });
    }

    const playlist = await Playlist.findById(id);
    if (!playlist) {
      return res.status(404).json({ message: 'Playlist not found' });
    }

    if (!req.user || playlist.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied: cannot modify another user\'s playlist' });
    }

    playlist.songs = playlist.songs.filter(s => s.id !== String(songId));
    await playlist.save();

    res.status(200).json(playlist);
  } catch (error) {
    console.error('removeSongFromPlaylist error:', error.message);
    res.status(500).json({ message: 'Server error removing song from playlist' });
  }
};

/**
 * Generate Smart Playlist matching user filters, real duration, and preferences
 */
export const generateSmartPlaylist = async (req, res) => {
  try {
    let user = null;
    if (req.user && req.user.id) {
      user = await User.findById(req.user.id);
    }

    const {
      mood,
      genre,
      energy,
      vocalPreference,
      language,
      targetDurationMinutes,
      preferences,
      excludedTrackIds
    } = req.body || {};

    const result = await buildSmartPlaylist({
      mood,
      genre,
      energy,
      vocalPreference,
      language,
      targetDurationMinutes,
      preferences,
      excludedTrackIds,
      user
    });

    res.status(200).json(result);
  } catch (error) {
    if (error.message && error.message.startsWith('Invalid')) {
      return res.status(400).json({ message: error.message });
    }
    console.error('generateSmartPlaylist error:', error.message);
    res.status(500).json({ message: 'Server error generating smart playlist' });
  }
};
