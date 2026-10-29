import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { connectTestDB, closeTestDB, clearTestDB } from './db.js';
import User from '../src/models/User.js';
import Favorite from '../src/models/Favorite.js';
import History from '../src/models/History.js';
import mongoose from 'mongoose';
import { generateToken } from '../src/middleware/authMiddleware.js';

// Ensure JWT_SECRET is set for tests
process.env.JWT_SECRET = 'test_secret_key';

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await closeTestDB();
});

beforeEach(async () => {
  await clearTestDB();
});

describe('Authentication API', () => {
  const validUser = {
    name: 'Test User',
    email: 'test@example.com',
    password: 'password123'
  };

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(app).post('/api/auth/register').send(validUser);
      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('token');
      expect(res.body.email).toBe(validUser.email);
    });

    it('should reject registration with missing fields', async () => {
      const res = await request(app).post('/api/auth/register').send({ email: 'test@example.com' });
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/provide name, email, and password/i);
    });

    it('should reject short passwords', async () => {
      const res = await request(app).post('/api/auth/register').send({ ...validUser, password: '123' });
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/at least 6 characters/i);
    });
    
    it('should handle duplicate email securely', async () => {
      await request(app).post('/api/auth/register').send(validUser);
      const res = await request(app).post('/api/auth/register').send(validUser);
      expect(res.statusCode).toBe(409);
      expect(res.body.message).toMatch(/Account creation failed/i);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app).post('/api/auth/register').send(validUser);
    });

    it('should login valid user', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: validUser.email,
        password: validUser.password
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('token');
    });

    it('should reject invalid credentials', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: validUser.email,
        password: 'wrongpassword'
      });
      expect(res.statusCode).toBe(401);
      expect(res.body.message).toMatch(/Invalid email or password/i);
    });
  });

  describe('JWT and Profile Handling', () => {
    let token;
    beforeEach(async () => {
      const res = await request(app).post('/api/auth/register').send(validUser);
      token = res.body.token;
    });

    it('should access profile with valid token', async () => {
      const res = await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.email).toBe(validUser.email);
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('should reject missing token', async () => {
      const res = await request(app).get('/api/auth/profile');
      expect(res.statusCode).toBe(401);
    });

    it('should reject malformed token safely', async () => {
      const res = await request(app).get('/api/auth/profile').set('Authorization', 'Bearer invalid_token');
      expect(res.statusCode).toBe(401);
    });
  });

  describe('User Isolation and Anonymous Records', () => {
    let userAToken;
    let userBToken;
    let userAId;

    beforeEach(async () => {
      const resA = await request(app).post('/api/auth/register').send(validUser);
      userAToken = resA.body.token;
      userAId = resA.body._id;

      const resB = await request(app).post('/api/auth/register').send({
        name: 'User B',
        email: 'userb@example.com',
        password: 'password123'
      });
      userBToken = resB.body.token;
    });

    it('should isolate favorites (User A cannot see User B favorites)', async () => {
      // User A adds a favorite
      await request(app).post('/api/favorites')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ songId: new mongoose.Types.ObjectId().toString(), externalData: { test: true } });
      
      // User B adds a favorite
      await request(app).post('/api/favorites')
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ songId: new mongoose.Types.ObjectId().toString(), externalData: { test: true } });

      const favsB = await request(app).get('/api/favorites').set('Authorization', `Bearer ${userBToken}`);
      expect(favsB.body.length).toBe(1);
      
      const allDBFavs = await Favorite.find();
      expect(allDBFavs.length).toBe(2);
    });

    it('should reject unauthenticated access to favorites and history with 401', async () => {
      const favRes = await request(app).get('/api/favorites');
      expect(favRes.status).toBe(401);

      const histRes = await request(app).get('/api/history');
      expect(histRes.status).toBe(401);

      const addFavRes = await request(app).post('/api/favorites').send({ songId: '123' });
      expect(addFavRes.status).toBe(401);

      const addHistRes = await request(app).post('/api/history').send({ songId: '123', title: 'T', artist: 'A' });
      expect(addHistRes.status).toBe(401);
    });

    it('should isolate favorites and prevent cross-user deletion attempts', async () => {
      const songId1 = new mongoose.Types.ObjectId().toString();
      const songId2 = new mongoose.Types.ObjectId().toString();

      // User A adds a favorite
      const addA = await request(app)
        .post('/api/favorites')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ songId: songId1, externalData: { title: 'Track A' } });
      expect(addA.status).toBe(201);
      const favAId = addA.body._id;

      // User B adds a favorite
      const addB = await request(app)
        .post('/api/favorites')
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ songId: songId2, externalData: { title: 'Track B' } });
      expect(addB.status).toBe(201);

      // User A sees only Track A
      const listA = await request(app)
        .get('/api/favorites')
        .set('Authorization', `Bearer ${userAToken}`);
      expect(listA.body.length).toBe(1);
      expect(listA.body[0].songId.title).toBe('Track A');

      // User B cannot delete User A's favorite
      const crossDeleteRes = await request(app)
        .delete(`/api/favorites/${favAId}`)
        .set('Authorization', `Bearer ${userBToken}`);
      expect(crossDeleteRes.status).toBe(404);

      // Verify User A's favorite still exists
      const verifyA = await request(app)
        .get('/api/favorites')
        .set('Authorization', `Bearer ${userAToken}`);
      expect(verifyA.body.length).toBe(1);

      // User A can remove their own favorite
      const deleteA = await request(app)
        .delete(`/api/favorites/${favAId}`)
        .set('Authorization', `Bearer ${userAToken}`);
      expect(deleteA.status).toBe(200);
    });

    it('should invalidate token if user account is deleted', async () => {
      // Create user and token
      const tempUser = await User.create({ name: 'Temp', email: 'temp@example.com', passwordHash: 'password123' });
      const tempToken = generateToken(tempUser._id);

      // Access profile works
      const res1 = await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${tempToken}`);
      expect(res1.status).toBe(200);

      // Delete user
      await User.findByIdAndDelete(tempUser._id);

      // Subsequent access with that token must be rejected with 401
      const res2 = await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${tempToken}`);
      expect(res2.status).toBe(401);
      expect(res2.body.message).toMatch(/no longer exists/i);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits and return 429', async () => {
      // Overwrite limits for testing locally if needed, or just spam the endpoint.
      // Wait, standard rate limit is 5. So loop 6 times.
      // Limit in test env is 100
      let lastStatus = 200;
      for (let i = 0; i < 102; i++) {
        const res = await request(app).post('/api/auth/login').send({
          email: 'test@example.com',
          password: 'wrong'
        });
        lastStatus = res.statusCode;
      }
      expect(lastStatus).toBe(429);
    });
  });
});
