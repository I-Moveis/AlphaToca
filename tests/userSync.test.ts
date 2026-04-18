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

  it('should use a sub-scoped placeholder phoneNumber when not provided in Auth0 data', async () => {
    const auth0Data = {
      sub: 'auth0|789',
      name: 'No Phone User',
    };

    (prisma.user.upsert as any).mockResolvedValue({
      id: 'some-uuid-3',
      auth0Sub: 'auth0|789',
      name: 'No Phone User',
      phoneNumber: 'pending:auth0|789',
      role: 'TENANT',
    });

    const result = await userService.upsertUserFromAuth0(auth0Data);

    expect(prisma.user.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ phoneNumber: 'pending:auth0|789' }),
    }));
    expect(result.phoneNumber).toBe('pending:auth0|789');
  });

  it('should not downgrade role when the roles claim is absent from the token', async () => {
    const auth0Data = {
      sub: 'auth0|existing-admin',
      name: 'Admin User',
      phone_number: '+5511999999999',
    };

    (prisma.user.upsert as any).mockResolvedValue({
      id: 'admin-uuid',
      auth0Sub: 'auth0|existing-admin',
      name: 'Admin User',
      phoneNumber: '+5511999999999',
      role: 'ADMIN',
    });

    await userService.upsertUserFromAuth0(auth0Data);

    const call = (prisma.user.upsert as any).mock.calls[0][0];
    expect(call.update).not.toHaveProperty('role');
    expect(call.create.role).toBe('TENANT');
  });

  it('should throw when the Auth0 payload has no "sub" claim', async () => {
    await expect(
      userService.upsertUserFromAuth0({ name: 'No Sub' } as any)
    ).rejects.toThrow(/sub/);
  });
});
