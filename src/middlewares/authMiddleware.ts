import { auth } from 'express-oauth2-jwt-bearer';
import { Request, Response, NextFunction } from 'express';
import { userService } from '../services/userService';

// Authorization middleware. When used, the Access Token must
// exist and be verified against the Auth0 JSON Web Key Set.
export const checkJwt = auth({
  audience: process.env.AUTH0_AUDIENCE,
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
  tokenSigningAlg: 'RS256'
});

/**
 * Middleware to synchronize user data from Auth0 to our local database.
 * This should be used after checkJwt.
 */
export const authSyncMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // @ts-ignore - express-oauth2-jwt-bearer attaches auth property
    const authData = req.auth;
    
    if (authData && authData.payload) {
      await userService.upsertUserFromAuth0(authData.payload);
    }
    
    next();
  } catch (error) {
    console.error('[AuthSync] Error syncing user:', error);
    // We continue even if sync fails to not block the user, 
    // though in some systems you might want to block.
    next();
  }
};
