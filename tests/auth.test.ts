import { describe, it, expect, vi } from 'vitest';

// Must set env vars BEFORE importing app (which calls validateAuthConfig)
process.env.AUTH0_AUDIENCE = 'test-audience';
process.env.AUTH0_ISSUER_BASE_URL = 'https://test-tenant.auth0.com';

vi.mock('../src/middlewares/authMiddleware', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    // Bypass real Auth0 validation in tests
    validateAuthConfig: () => {
      console.log('[Auth] Test mode: skipping config validation.');
    },
    checkJwt: (req: any, res: any, next: any) => {
      const authHeader = req.headers.authorization;
      if (authHeader === 'Bearer valid-token') {
        // Mock Auth0 payload on the request object
        req.auth = {
          payload: {
            sub: 'auth0|mock-user',
            name: 'Mock User',
            phone_number: '+111111111'
          },
          header: {},
          token: 'valid-token'
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
      upsertUserFromAuth0: vi.fn().mockResolvedValue({
        id: 'some-uuid',
        auth0Sub: 'auth0|mock-user',
        name: 'Mock User',
        phoneNumber: '+111111111',
        role: 'TENANT'
      }),
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

  it('should return 401 Unauthorized for /api/users if no token provided', async () => {
    const response = await request(app).get('/api/users');
    expect(response.status).toBe(401);
  });

  it('should return authenticated user profile at /api/users/me', async () => {
    const response = await request(app)
      .get('/api/users/me')
      .set('Authorization', 'Bearer valid-token');
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('auth0Sub', 'auth0|mock-user');
    expect(response.body).toHaveProperty('name', 'Mock User');
  });

  it('should allow webhook routes WITHOUT authentication', async () => {
    const response = await request(app)
      .get('/api/webhook')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': process.env.WHATSAPP_VERIFY_TOKEN, 'hub.challenge': 'test-challenge' });
    // Webhook should not return 401 (it's unprotected)
    expect(response.status).not.toBe(401);
  });
});
