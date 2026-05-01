import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { userService } from '../services/userService';
import { logger } from '../config/logger';
import admin from '../config/firebase';

/**
 * Validates that required Firebase environment variables are set.
 * Should be called at application startup.
 */
export const validateAuthConfig = (): void => {
  const required = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `[Auth] Missing required Firebase environment variables: ${missing.join(', ')}. ` +
      `Check your .env file.`
    );
  }

  logger.info('[auth] Firebase Auth configuration validated successfully');
};

/**
 * Authorization middleware using Firebase Admin SDK.
 * Expects 'Authorization: Bearer <token>' in the request headers.
 */
export const checkJwt = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
       return res.status(401).json({
         status: 401,
         code: 'UNAUTHORIZED',
         messages: [{ message: 'Missing or invalid Authorization header.' }]
       });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Attach the decoded token to the request for the next middleware
    (req as any).auth = { payload: decodedToken };
    next();
  } catch (error) {
    logger.error({ err: error }, '[auth] token verification failed');
    return res.status(401).json({
      status: 401,
      code: 'UNAUTHORIZED',
      messages: [{ message: 'Invalid token.' }]
    });
  }
};

/**
 * Middleware to synchronize user data from Firebase to our local database.
 * Must be used after checkJwt. Attaches the local user to req.localUser.
 */
export const authSyncMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authData = (req as any).auth;

    if (!authData?.payload) {
      return res.status(401).json({
        status: 401,
        code: 'UNAUTHORIZED',
        messages: [{ message: 'Missing authentication payload.' }]
      });
    }

    const user = await userService.upsertUserFromFirebase(
      authData.payload as admin.auth.DecodedIdToken
    );
    (req as any).localUser = user;
    next();
  } catch (error) {
    logger.error({ err: error }, '[auth-sync] error syncing user');
    next(error);
  }
};

/**
 * Middleware factory to enforce role-based access control.
 * Must be used after authSyncMiddleware (which attaches localUser).
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
