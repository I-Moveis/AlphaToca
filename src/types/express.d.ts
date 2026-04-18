import { User } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      localUser?: User;
    }
  }
}

export {};
