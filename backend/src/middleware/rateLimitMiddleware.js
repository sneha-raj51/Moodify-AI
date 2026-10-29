import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: (process.env.RATE_LIMIT_WINDOW_MINS || 15) * 60 * 1000,
  max: process.env.RATE_LIMIT_MAX_AUTH ? parseInt(process.env.RATE_LIMIT_MAX_AUTH, 10) : 100,
  message: { message: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'test' && req.headers['x-test-bypass-rate-limit'] === 'true',
});
