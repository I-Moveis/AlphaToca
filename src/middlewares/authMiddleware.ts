import { auth, UnauthorizedError } from 'express-oauth2-jwt-bearer';
import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { userService } from '../services/userService';

/**
 * Validates that required Auth0 environment variables are set.
 * Should be called at application startup.
 */
export const validateAuthConfig = (): void => {
  const required = ['AUTH0_AUDIENCE', 'AUTH0_ISSUER_BASE_URL'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `[Auth] Missing required Auth0 environment variables: ${missing.join(', ')}. ` +
      `Check your .env file.`
    );
  }

  console.log('[Auth] Auth0 configuration validated successfully.');
};

/**
 * Authorization middleware. When used, the Access Token must
 * exist and be verified against the Auth0 JSON Web Key Set.
 */
export const checkJwt = auth({
  audience: process.env.AUTH0_AUDIENCE,
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
  tokenSigningAlg: 'RS256'
});

/**
 * Middleware to synchronize user data from Auth0 to our local database.
 * This should be used after checkJwt.
 * Also attaches the local user to req for downstream use.
 */
export const authSyncMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authData = req.auth;

    if (authData && authData.payload) {
      const user = await userService.upsertUserFromAuth0(
        authData.payload as Record<string, unknown>
      );
      // Attach local user data for downstream controllers
      (req as any).localUser = user;
    }

    next();
  } catch (error) {
    console.error('[AuthSync] Error syncing user:', error);
    // We continue even if sync fails to not block the user
    next();
  }
};

/**
 * Middleware factory to enforce role-based access control.
 * Must be used after authSyncMiddleware (which attaches localUser).
 *
 * @example
 *   router.delete('/users/:id', requireRole('ADMIN'), userController.delete);
 */
export const requireRole = (...allowedRoles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const localUser = (req as any).localUser;

    if (!localUser) {
      return res.status(403).json({
        status: 403,
        code: 'FORBIDDEN',
        messages: [{ message: 'User profile not found. Access denied.' }]
      });
    }

    if (!allowedRoles.includes(localUser.role)) {
      return res.status(403).json({
        status: 403,
        code: 'FORBIDDEN',
        messages: [{ message: `Role '${localUser.role}' is not authorized. Required: ${allowedRoles.join(', ')}` }]
      });
    }

    next();
  };
};
