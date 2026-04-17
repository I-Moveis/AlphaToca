import { describe, it, expect, vi, beforeEach } from 'vitest';
import { userService } from '../src/services/userService';
import prisma from '../src/config/db';

vi.mock('../src/config/db', () => ({
  default: {
    user: {
      upsert: vi.fn(),
    },
  },
}));

describe('User Synchronization Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should upsert a user from Auth0 data using auth0Sub', async () => {
    const auth0Data = {
      sub: 'auth0|123',
      name: 'John Doe',
      phone_number: '+1234567890',
      'https://alphatoca.com/roles': ['LANDLORD'],
    };

    (prisma.user.upsert as any).mockResolvedValue({
      id: 'some-uuid',
      auth0Sub: 'auth0|123',
      name: 'John Doe',
      phoneNumber: '+1234567890',
      role: 'LANDLORD',
    });

    const result = await userService.upsertUserFromAuth0(auth0Data);

    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { auth0Sub: 'auth0|123' },
      update: {
        name: 'John Doe',
        phoneNumber: '+1234567890',
        role: 'LANDLORD',
      },
      create: {
        auth0Sub: 'auth0|123',
        name: 'John Doe',
        phoneNumber: '+1234567890',
        role: 'LANDLORD',
      },
    });
    expect(result.role).toBe('LANDLORD');
  });

  it('should fallback to TENANT role if no valid role is provided', async () => {
    const auth0Data = {
      sub: 'auth0|456',
      name: 'Jane Doe',
      phone_number: '+0987654321',
    };

    (prisma.user.upsert as any).mockResolvedValue({
      id: 'some-uuid-2',
      auth0Sub: 'auth0|456',
      name: 'Jane Doe',
      phoneNumber: '+0987654321',
      role: 'TENANT',
    });

    const result = await userService.upsertUserFromAuth0(auth0Data);

    expect(prisma.user.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ role: 'TENANT', auth0Sub: 'auth0|456' }),
    }));
    expect(result.role).toBe('TENANT');
  });

  it('should use "pending" phoneNumber when not provided in Auth0 data', async () => {
    const auth0Data = {
      sub: 'auth0|789',
      name: 'No Phone User',
    };

    (prisma.user.upsert as any).mockResolvedValue({
      id: 'some-uuid-3',
      auth0Sub: 'auth0|789',
      name: 'No Phone User',
      phoneNumber: 'pending',
      role: 'TENANT',
    });

    const result = await userService.upsertUserFromAuth0(auth0Data);

    expect(prisma.user.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ phoneNumber: 'pending' }),
    }));
    expect(result.phoneNumber).toBe('pending');
  });
});
