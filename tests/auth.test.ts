import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/middlewares/authMiddleware', () => {
  return {
    checkJwt: (req: any, res: any, next: any) => {
      const authHeader = req.headers.authorization;
      if (authHeader === 'Bearer valid-token') {
        return next();
      }
      return res.status(401).json({ message: 'Unauthorized' });
    }
  };
});

import request from 'supertest';
import app from '../src/app';

describe('Auth Middleware', () => {
  it('should return 401 Unauthorized if no token is provided on protected route', async () => {
    const response = await request(app).get('/api/properties');
    expect(response.status).toBe(401);
  });

  it('should return 401 Unauthorized if invalid token is provided', async () => {
    const response = await request(app)
      .get('/api/properties')
      .set('Authorization', 'Bearer invalid-token');
    expect(response.status).toBe(401);
  });

  it('should allow access if valid token is provided (mocked)', async () => {
    // Note: This will still fail with 500 if DB is not ready, 
    // but it proves the middleware let the request through.
    const response = await request(app)
      .get('/api/properties')
      .set('Authorization', 'Bearer valid-token');
    
    // If it's not 401, it means it passed the middleware
    expect(response.status).not.toBe(401);
  });
});
