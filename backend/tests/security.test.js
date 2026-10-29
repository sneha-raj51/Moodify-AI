import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { connectTestDB, closeTestDB, clearTestDB } from './db.js';
import User from '../src/models/User.js';
import Favorite from '../src/models/Favorite.js';
import History from '../src/models/History.js';
import { generateToken } from '../src/middleware/authMiddleware.js';
import { getLastSentEmailForTesting, clearSentEmailsForTesting } from '../src/services/emailService.js';

process.env.JWT_SECRET = 'test_secret_key_security';
process.env.CORS_ORIGIN = 'http://localhost:5173';

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await closeTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  clearSentEmailsForTesting();
});

describe('Production Readiness & Security Verifications', () => {
  describe('1. Password Reset Token Leakage & Safe Delivery', () => {
    it('should NEVER expose resetToken in forgot-password response', async () => {
      const user = await User.create({
        name: 'Alice',
        email: 'alice@security.test',
        passwordHash: 'password123'
      });

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .set('x-test-bypass-rate-limit', 'true')
        .send({ email: 'alice@security.test' });

      expect(res.status).toBe(200);
      // Strictly verify no token is present in JSON response
      expect(res.body.resetToken).toBeUndefined();
      expect(res.body.token).toBeUndefined();
      expect(res.body.expiresIn).toBeUndefined();
      expect(res.body.message).toBe('If an account with that email exists, password reset instructions have been sent.');

      // Verify token was delivered securely out-of-band via email service
      const sentEmail = getLastSentEmailForTesting();
      expect(sentEmail).toBeDefined();
      expect(sentEmail.to).toBe('alice@security.test');
      expect(sentEmail.token).toBeDefined();
      expect(typeof sentEmail.token).toBe('string');
      expect(sentEmail.token.length).toBe(64); // 32 random bytes in hex
    });

    it('should return identical safe response for non-existent email (anti-enumeration)', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .set('x-test-bypass-rate-limit', 'true')
        .send({ email: 'nonexistent@security.test' });

      expect(res.status).toBe(200);
      expect(res.body.resetToken).toBeUndefined();
      expect(res.body.message).toBe('If an account with that email exists, password reset instructions have been sent.');
    });

    it('should reject expired reset tokens with HTTP 400', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

      await User.create({
        name: 'Bob',
        email: 'bob@security.test',
        passwordHash: 'password123',
        resetPasswordToken: hashedToken,
        resetPasswordExpires: new Date(Date.now() - 60000) // Expired 1 minute ago
      });

      const res = await request(app)
        .post('/api/auth/reset-password')
        .set('x-test-bypass-rate-limit', 'true')
        .send({
          email: 'bob@security.test',
          token: rawToken,
          newPassword: 'newPassword123'
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid or has expired/i);
    });

    it('should enforce single-use reset tokens and reject reuse', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

      await User.create({
        name: 'Carol',
        email: 'carol@security.test',
        passwordHash: 'password123',
        resetPasswordToken: hashedToken,
        resetPasswordExpires: new Date(Date.now() + 3600000) // Valid for 1 hour
      });

      // First use succeeds
      const firstUse = await request(app)
        .post('/api/auth/reset-password')
        .set('x-test-bypass-rate-limit', 'true')
        .send({
          email: 'carol@security.test',
          token: rawToken,
          newPassword: 'brandNewPassword123'
        });

      expect(firstUse.status).toBe(200);
      expect(firstUse.body.message).toMatch(/successfully reset/i);

      // Second use with same token MUST fail (single-use validation)
      const secondUse = await request(app)
        .post('/api/auth/reset-password')
        .set('x-test-bypass-rate-limit', 'true')
        .send({
          email: 'carol@security.test',
          token: rawToken,
          newPassword: 'anotherPassword123'
        });

      expect(secondUse.status).toBe(400);
      expect(secondUse.body.message).toMatch(/invalid or has expired/i);
    });
  });

  describe('2. Unauthenticated Favorites and History Requests (HTTP 401)', () => {
    it('should reject unauthenticated Favorites endpoints with HTTP 401', async () => {
      const getRes = await request(app).get('/api/favorites');
      expect(getRes.status).toBe(401);
      expect(getRes.body.message).toMatch(/not authorized/i);

      const postRes = await request(app)
        .post('/api/favorites')
        .send({ songId: new mongoose.Types.ObjectId().toString() });
      expect(postRes.status).toBe(401);

      const deleteRes = await request(app)
        .delete(`/api/favorites/${new mongoose.Types.ObjectId()}`);
      expect(deleteRes.status).toBe(401);
    });

    it('should reject unauthenticated History endpoints with HTTP 401', async () => {
      const getRes = await request(app).get('/api/history');
      expect(getRes.status).toBe(401);
      expect(getRes.body.message).toMatch(/not authorized/i);

      const recapRes = await request(app).get('/api/history/recap?range=7d');
      expect(recapRes.status).toBe(401);

      const postRes = await request(app)
        .post('/api/history')
        .send({ songId: 'song_1', title: 'Song 1', artist: 'Artist 1' });
      expect(postRes.status).toBe(401);

      const updateRes = await request(app)
        .put(`/api/history/${new mongoose.Types.ObjectId()}`)
        .send({ listenedDuration: 20 });
      expect(updateRes.status).toBe(401);

      const deleteRes = await request(app).delete('/api/history');
      expect(deleteRes.status).toBe(401);
    });
  });

  describe('3. Cross-User Data Isolation and Unauthorized Access Prevention', () => {
    let userA, tokenA;
    let userB, tokenB;

    beforeEach(async () => {
      userA = await User.create({ name: 'User A', email: 'usera@sec.test', passwordHash: 'password123' });
      tokenA = generateToken(userA._id);

      userB = await User.create({ name: 'User B', email: 'userb@sec.test', passwordHash: 'password123' });
      tokenB = generateToken(userB._id);
    });

    it('should prevent User B from reading User A favorites', async () => {
      const songId = new mongoose.Types.ObjectId().toString();
      await request(app)
        .post('/api/favorites')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ songId, externalData: { title: 'Secret Track A' } });

      const resB = await request(app)
        .get('/api/favorites')
        .set('Authorization', `Bearer ${tokenB}`);

      expect(resB.status).toBe(200);
      expect(resB.body.length).toBe(0);
    });

    it('should prevent User B from deleting User A favorite', async () => {
      const songId = new mongoose.Types.ObjectId().toString();
      const createRes = await request(app)
        .post('/api/favorites')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ songId, externalData: { title: 'Favorite A' } });

      const favId = createRes.body._id;

      // User B attempts to delete User A's favorite
      const deleteAttempt = await request(app)
        .delete(`/api/favorites/${favId}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(deleteAttempt.status).toBe(404);

      // Verify User A still has the favorite intact
      const verifyA = await request(app)
        .get('/api/favorites')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(verifyA.status).toBe(200);
      expect(verifyA.body.length).toBe(1);
    });

    it('should prevent User B from reading or updating User A history', async () => {
      const createHistRes = await request(app)
        .post('/api/history')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ songId: 'song_a', title: 'Title A', artist: 'Artist A', listenedDuration: 30 });

      const histId = createHistRes.body._id;

      // User B history list should be empty
      const listB = await request(app)
        .get('/api/history')
        .set('Authorization', `Bearer ${tokenB}`);
      expect(listB.body.length).toBe(0);

      // User B attempts to update User A's history record
      const updateAttempt = await request(app)
        .put(`/api/history/${histId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ completed: true });

      expect(updateAttempt.status).toBe(404);
    });
  });

  describe('4. CORS Configuration', () => {
    it('should handle CORS origin dynamically from CORS_ORIGIN environment variable', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:5173');

      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });
  });
});
