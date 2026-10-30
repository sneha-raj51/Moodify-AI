import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isOriginAllowed } from '../src/app.js';

describe('Production CORS Policy Verification', () => {
  const originalEnv = process.env.CORS_ORIGIN;

  beforeEach(() => {
    delete process.env.CORS_ORIGIN;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CORS_ORIGIN = originalEnv;
    } else {
      delete process.env.CORS_ORIGIN;
    }
  });

  it('allows non-browser requests without origin header (curl, mobile, health checks)', () => {
    expect(isOriginAllowed(undefined)).toBe(true);
    expect(isOriginAllowed(null)).toBe(true);
    expect(isOriginAllowed('')).toBe(true);
  });

  it('allows Vercel production and preview deployment origins automatically', () => {
    expect(isOriginAllowed('https://moodify-ai.vercel.app')).toBe(true);
    expect(isOriginAllowed('https://moodify-frontend.vercel.app')).toBe(true);
    expect(isOriginAllowed('https://moodify-ai-git-master-sneha-raj51s-projects.vercel.app')).toBe(true);
    expect(isOriginAllowed('https://vercel.app')).toBe(true);
  });

  it('rejects spoofed or malicious vercel subdomains', () => {
    expect(isOriginAllowed('https://evil-site.com')).toBe(false);
    expect(isOriginAllowed('https://vercel.app.attacker.com')).toBe(false);
    expect(isOriginAllowed('http://moodify.vercel.app')).toBe(false); // Insecure HTTP
  });

  it('allows local development origins', () => {
    expect(isOriginAllowed('http://localhost:5173')).toBe(true);
    expect(isOriginAllowed('http://localhost:3000')).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:5173')).toBe(true);
  });

  it('allows explicitly configured origins from CORS_ORIGIN environment variable', () => {
    process.env.CORS_ORIGIN = 'https://customdomain.com, https://app.moodify.com/';
    expect(isOriginAllowed('https://customdomain.com')).toBe(true);
    expect(isOriginAllowed('https://app.moodify.com')).toBe(true);
    expect(isOriginAllowed('https://unconfigured.com')).toBe(false);
  });

  it('allows all origins when CORS_ORIGIN is wildcard *', () => {
    process.env.CORS_ORIGIN = '*';
    expect(isOriginAllowed('https://any-domain.com')).toBe(true);
  });
});

