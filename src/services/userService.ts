import { Role, User } from '@prisma/client';
import prisma from '../config/db';

export const userService = {
  async getAllUsers(): Promise<User[]> {
    return await prisma.user.findMany({
      orderBy: { createdAt: 'desc' }
    });
  },

  async getUserById(id: string): Promise<User | null> {
    return await prisma.user.findUnique({
      where: { id }
    });
  },

  async getUserByFirebaseUid(firebaseUid: string): Promise<User | null> {
    return await prisma.user.findUnique({
      where: { firebaseUid }
    });
  },

  async createUser(data: { name: string; email: string; phoneNumber: string; role: Role }): Promise<User> {
    return await prisma.user.create({
      data
    });
  },

  async updateUser(id: string, data: Partial<{ name: string; email: string; phoneNumber: string; role: Role; fcmToken: string }>): Promise<User | null> {
    try {
      return await prisma.user.update({
        where: { id },
        data
      });
    } catch (error) {
      return null; // User not found
    }
  },

  async deleteUser(id: string): Promise<boolean> {
    try {
      await prisma.user.delete({
        where: { id }
      });
      return true;
    } catch (error) {
      return false; // User not found
    }
  },

  /**
   * Upsert a user from Firebase Auth JWT payload.
   * Uses firebaseUid (the "uid" claim) as the unique identifier for sync.
   * If the user doesn't exist, creates a new one with a UUID id.
   */
  async upsertUserFromFirebase(firebasePayload: any): Promise<User> {
    const uid = firebasePayload.uid;
    if (typeof uid !== 'string' || uid.length === 0) {
      throw new Error('Firebase payload is missing the "uid" claim.');
    }

    // Attempt to extract name from payload or email
    const name = (firebasePayload.name as string) || (firebasePayload.email ? firebasePayload.email.split('@')[0] : 'Unknown');
    const email = firebasePayload.email as string | undefined;
    const phoneNumber = firebasePayload.phone_number as string | undefined;
    
    // Custom claims in Firebase are usually accessed directly from the payload.
    // If you plan to set 'role' via custom claims, we can read it here.
    const rolesClaim = firebasePayload.roles || firebasePayload.role;
    const roles = Array.isArray(rolesClaim) 
      ? rolesClaim.map((r) => String(r).toUpperCase())
      : typeof rolesClaim === 'string' ? [rolesClaim.toUpperCase()] : null;

    let mappedRole: Role | undefined;
    if (roles) {
      if (roles.includes('ADMIN')) mappedRole = 'ADMIN';
      else if (roles.includes('LANDLORD')) mappedRole = 'LANDLORD';
      else mappedRole = 'TENANT';
    }

    // phoneNumber is @unique in the schema, so a shared "pending" placeholder
    // would collide for the second user without a phone claim. Scope it per uid.
    const placeholderPhone = `pending:${uid}`;

    return await prisma.user.upsert({
      where: { firebaseUid: uid },
      update: {
        name,
        ...(email && { email }),
        ...(phoneNumber && { phoneNumber }),
        ...(mappedRole && { role: mappedRole })
      },
      create: {
        firebaseUid: uid,
        name,
        email,
        phoneNumber: phoneNumber || placeholderPhone,
        role: mappedRole ?? 'TENANT'
      }
    });
  }
};
