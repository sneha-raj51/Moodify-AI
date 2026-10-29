import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const generateToken = (userId) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined in environment variables');
  }
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn,
  });
};

export const optionalAuth = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded && decoded.id) {
          const user = await User.findById(decoded.id).select('_id name email');
          if (user) {
            req.user = { id: user._id.toString(), email: user.email, name: user.name };
          }
        }
      }
    } catch (error) {
      // Optional auth: ignore token errors and proceed unauthenticated
    }
  }

  next();
};

export const requireAuth = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      if (!token || !token.trim()) {
        return res.status(401).json({ message: 'Not authorized, token missing' });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!decoded || !decoded.id) {
        return res.status(401).json({ message: 'Not authorized, invalid token payload' });
      }

      // Invalidate tokens for deleted or nonexistent users
      const user = await User.findById(decoded.id).select('_id name email');
      if (!user) {
        return res.status(401).json({ message: 'Not authorized, user account no longer exists' });
      }

      req.user = { id: user._id.toString(), email: user.email, name: user.name };
      next();
    } catch (error) {
      res.status(401).json({ message: 'Not authorized, token failed' });
    }
  } else {
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};

export const protect = requireAuth;

