import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  passwordHash: {
    type: String,
    required: true
  },
  preferences: {
    favoriteGenres: { type: [String], default: [] },
    favoriteArtists: { type: [String], default: [] },
    preferredLanguages: { type: [String], default: [] },
    energyLevel: { type: String, default: 'balanced' },
    defaultMood: { type: String, default: 'Happy' },
    preferredMoods: { type: [String], default: [] },
    favoriteListeningModes: { type: [String], default: [] },
    updatedAt: { type: Date, default: Date.now }
  },
  resetPasswordToken: {
    type: String,
    default: null
  },
  resetPasswordExpires: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

userSchema.pre('save', async function () {
  if (!this.isModified('passwordHash')) return;
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

const User = mongoose.model('User', userSchema);
export default User;
