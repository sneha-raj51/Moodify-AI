import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ML Controller Integration', () => {
  it('should return 400 if no image file is provided', async () => {
    const res = await request(app).post('/api/ml/predict');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('No image file provided');
  });

  it('should return 503 when ML model is not ready (missing weights)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({ detail: 'model_not_ready' })
    });

    const res = await request(app)
      .post('/api/ml/predict')
      .attach('file', Buffer.from('mock image data'), 'test.jpg');

    expect(res.status).toBe(503);
    expect(res.body.message).toContain('ML Model not ready');
  });

  it('should handle Python service connection failure (502)', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:8000'));

    const res = await request(app)
      .post('/api/ml/predict')
      .attach('file', Buffer.from('mock image data'), 'test.jpg');

    expect(res.status).toBe(502);
    expect(res.body.message).toBe('Failed to connect to ML Service');
  });

  it('should forward is_cropped field to the Python ML service', async () => {
    let capturedFormData = null;
    vi.spyOn(global, 'fetch').mockImplementation(async (url, options) => {
      capturedFormData = options.body;
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          expression: 'happy',
          confidence: 0.88,
          scores: { happy: 0.88, neutral: 0.12 },
          faces_detected: 1
        })
      };
    });

    const res = await request(app)
      .post('/api/ml/predict')
      .field('is_cropped', 'true')
      .attach('file', Buffer.from('cropped face image data'), 'face.jpg');

    expect(res.status).toBe(200);
    expect(res.body.expression).toBe('happy');
    expect(res.body.confidence).toBe(0.88);
    expect(capturedFormData).not.toBeNull();
    expect(capturedFormData.get('is_cropped')).toBe('true');
  });

  it('should forward no_face_detected HTTP 400 error from ML service', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ detail: 'no_face_detected' })
    });

    const res = await request(app)
      .post('/api/ml/predict')
      .attach('file', Buffer.from('blank image data'), 'blank.jpg');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('no_face_detected');
  });

  it('should forward emotion confidence, class probabilities, and low_confidence flag from ML service', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        expression: 'happy',
        predicted_emotion: 'happy',
        confidence: 0.78,
        scores: { happy: 0.78, sad: 0.05, neutral: 0.17 },
        class_probabilities: { happy: 0.78, sad: 0.05, neutral: 0.17 },
        low_confidence: false,
        confidence_threshold: 0.50,
        faces_detected: 1,
        model_version: 'resnet18-fer2013-v1.1'
      })
    });

    const res = await request(app)
      .post('/api/ml/predict')
      .attach('file', Buffer.from('mock face image data'), 'face.jpg');

    expect(res.status).toBe(200);
    expect(res.body.predicted_emotion).toBe('happy');
    expect(res.body.confidence).toBe(0.78);
    expect(res.body.low_confidence).toBe(false);
    expect(res.body.class_probabilities).toHaveProperty('happy', 0.78);
    expect(res.body.model_version).toBe('resnet18-fer2013-v1.1');
  });

  it('should return 504 when ML service request times out', async () => {
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    vi.spyOn(global, 'fetch').mockRejectedValue(abortErr);

    const res = await request(app)
      .post('/api/ml/predict')
      .attach('file', Buffer.from('mock face image data'), 'face.jpg');

    expect(res.status).toBe(504);
    expect(res.body.message).toBe('ML Service timed out');
  });
});

