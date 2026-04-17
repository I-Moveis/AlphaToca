import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/middlewares/authMiddleware', async (importOriginal) => {
  process.env.AUTH0_AUDIENCE = 'test-audience';
  process.env.AUTH0_ISSUER_BASE_URL = 'https://test-tenant.auth0.com';
  const actual: any = await importOriginal();
  return {
    ...actual,
    checkJwt: (req: any, res: any, next: any) => {
      const authHeader = req.headers.authorization;
      if (authHeader === 'Bearer valid-token') {
        // Mock Auth0 payload on the request object
        req.auth = {
          payload: {
            sub: 'auth0|mock-user',
            name: 'Mock User',
            phone_number: '+111111111'
          }
        };
        return next();
      }
      return res.status(401).json({ message: 'Unauthorized' });
    }
  };
});

vi.mock('../src/services/userService', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    userService: {
      ...actual.userService,
      upsertUserFromAuth0: vi.fn().mockResolvedValue({ id: 'auth0|mock-user' }),
    },
  };
});

import request from 'supertest';
import app from '../src/app';
import { userService } from '../src/services/userService';

describe('Auth Middleware & User Sync Integration', () => {
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

  it('should allow access and trigger user sync if valid token is provided', async () => {
    const response = await request(app)
      .get('/api/properties')
      .set('Authorization', 'Bearer valid-token');
    
    expect(response.status).not.toBe(401);
    // Verify that upsertUserFromAuth0 was called
    expect(userService.upsertUserFromAuth0).toHaveBeenCalled();
  });
});
