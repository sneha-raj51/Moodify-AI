import crypto from 'crypto';
import User from '../models/User.js';
import { generateToken } from '../middleware/authMiddleware.js';
import { sendPasswordResetEmail } from '../services/emailService.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const registerUser = async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Please provide name, email, and password' });
  }

  if (typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    return res.status(400).json({ message: 'Please provide a valid email address' });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }

  try {
    const userExists = await User.findOne({ email: email.trim().toLowerCase() });
    if (userExists) {
      return res.status(409).json({ message: 'Account creation failed. Email may already be in use.' });
    }

    const user = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordHash: password, // Pre-save hook will hash it
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        preferences: user.preferences,
        token: generateToken(user._id),
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const loginUser = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Please provide email and password' });
  }

  try {
    const user = await User.findOne({ email: email.trim().toLowerCase() });

    if (user && (await user.comparePassword(password))) {
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        preferences: user.preferences,
        token: generateToken(user._id),
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-passwordHash -resetPasswordToken -resetPasswordExpires');
    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email || !EMAIL_REGEX.test(email.trim())) {
    return res.status(400).json({ message: 'Please provide a valid email address' });
  }

  const genericSuccessMessage = 'If an account with that email exists, password reset instructions have been sent.';

  try {
    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      // Security: Don't reveal account existence, return identical generic success
      return res.status(200).json({ message: genericSuccessMessage });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour validity
    await user.save();

    // Secure email delivery: never log or expose the raw token in HTTP responses
    try {
      await sendPasswordResetEmail({
        to: user.email,
        token: resetToken,
        appName: 'Moodify AI'
      });
    } catch (emailErr) {
      console.warn('[ForgotPassword] Email delivery error:', emailErr.message);
    }

    // Never return resetToken in API response
    res.status(200).json({
      message: genericSuccessMessage
    });
  } catch (error) {
    console.error('forgotPassword error:', error.message);
    res.status(500).json({ message: 'Server error processing password reset request' });
  }
};

export const resetPassword = async (req, res) => {
  const { email, token, newPassword } = req.body;
  if (!email || !token || !newPassword) {
    return res.status(400).json({ message: 'Please provide email, token, and new password' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }

  try {
    const hashedToken = crypto.createHash('sha256').update(token.trim()).digest('hex');
    const user = await User.findOne({
      email: email.trim().toLowerCase(),
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Password reset token is invalid or has expired' });
    }

    user.passwordHash = newPassword; // Handled by pre-save bcrypt hook
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.status(200).json({
      message: 'Password has been successfully reset. You can now log in with your new password.'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getPreferences = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('preferences');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json(user.preferences || {});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updatePreferences = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { favoriteGenres, favoriteArtists, preferredLanguages, energyLevel, defaultMood, preferredMoods, favoriteListeningModes } = req.body;

    if (!user.preferences) {
      user.preferences = {};
    }

    if (Array.isArray(favoriteGenres)) user.preferences.favoriteGenres = favoriteGenres;
    if (Array.isArray(favoriteArtists)) user.preferences.favoriteArtists = favoriteArtists;
    if (Array.isArray(preferredLanguages)) user.preferences.preferredLanguages = preferredLanguages;
    if (energyLevel !== undefined) user.preferences.energyLevel = energyLevel;
    if (defaultMood !== undefined) user.preferences.defaultMood = defaultMood;
    if (Array.isArray(preferredMoods)) user.preferences.preferredMoods = preferredMoods;
    if (Array.isArray(favoriteListeningModes)) user.preferences.favoriteListeningModes = favoriteListeningModes;
    user.preferences.updatedAt = new Date();

    await user.save();
    res.status(200).json(user.preferences);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

