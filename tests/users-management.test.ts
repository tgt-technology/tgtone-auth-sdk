import { TGTAuthClient } from '../tgtone-auth-client';
import type { TGTAuthConfig, UserProfile } from '../tgtone-auth-client';

function createMockJWT(payload: any): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.mock-signature`;
}

const mockUserProfile: UserProfile = {
  id: 'profile-1',
  userId: 'user-1',
  tenantId: 'tenant-1',
  firstName: 'Ana',
  lastName: 'González',
  avatarUrl: null,
  email: 'ana@empresa.cl',
  emailVerified: true,
  isActive: true,
  deletedAt: null,
  organizationalRole: null,
  applications: [
    { applicationId: 'app-1', applicationName: 'FormFlow', roleId: 'role-1', roleName: 'Editor' },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('TGTAuthClient — Gestión de usuarios (v4.3.0)', () => {
  let authClient: TGTAuthClient;
  const mockConfig: TGTAuthConfig = {
    coreApiUrl: 'http://localhost:3001',
    appDomain: 'localhost:3000',
    debug: false,
  };

  const mockJwt = createMockJWT({
    sub: 'admin-uuid',
    email: 'admin@empresa.cl',
    emailVerified: true,
    name: 'Admin',
    tenantId: 'tenant-1',
    tenantName: 'Empresa',
    roles: { formflow: ['ADMIN'] },
    exp: Math.floor(Date.now() / 1000) + 3600,
  });

  beforeEach(() => {
    authClient = new TGTAuthClient(mockConfig);
    localStorage.clear();
    localStorage.setItem('tgtone_auth_token', mockJwt);
    jest.restoreAllMocks();
  });

  describe('listUsers', () => {
    it('retorna usuarios tipados del tenant', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => [mockUserProfile],
      } as Response);

      const users = await authClient.listUsers('tenant-1');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/users?tenantId=tenant-1',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: `Bearer ${mockJwt}` }),
        }),
      );
      expect(users).toHaveLength(1);
      expect(users[0].email).toBe('ana@empresa.cl');
      expect(users[0].applications[0].roleName).toBe('Editor');
    });

    it('lanza error sin tenantId', async () => {
      await expect(authClient.listUsers('')).rejects.toThrow('tenantId es requerido');
    });

    it('lanza error sin sesión', async () => {
      localStorage.clear();
      await expect(authClient.listUsers('tenant-1')).rejects.toThrow('No hay sesión activa');
    });
  });

  describe('getUsersMap', () => {
    it('retorna mapa userId → UserSummary solo con usuarios activos', async () => {
      const deletedUser: UserProfile = {
        ...mockUserProfile,
        id: 'profile-2',
        userId: 'user-2',
        email: 'eliminado@empresa.cl',
        isActive: false,
        deletedAt: '2026-06-01T00:00:00.000Z',
      };

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => [mockUserProfile, deletedUser],
      } as Response);

      const map = await authClient.getUsersMap('tenant-1');

      expect(Object.keys(map)).toHaveLength(1);
      expect(map['user-1'].displayName).toBe('Ana González');
      expect(map['user-2']).toBeUndefined();
    });

    it('usa email como displayName cuando no hay nombre', async () => {
      const noName: UserProfile = { ...mockUserProfile, firstName: null, lastName: null };
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => [noName],
      } as Response);

      const map = await authClient.getUsersMap('tenant-1');
      expect(map['user-1'].displayName).toBe('ana@empresa.cl');
    });
  });

  describe('inviteUser', () => {
    it('envía POST a /users/invite con el body correcto', async () => {
      const inviteData = {
        email: 'nuevo@empresa.cl',
        firstName: 'Nuevo',
        lastName: 'Usuario',
        tenantId: 'tenant-1',
        applicationAccess: [{ applicationId: 'app-1', roleId: 'role-1' }],
      };

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: 'ok',
          userId: 'user-new',
          email: inviteData.email,
          firstName: 'Nuevo',
          lastName: 'Usuario',
          temporaryPassword: 'temp123',
          mustChangePassword: true,
        }),
      } as Response);

      const result = await authClient.inviteUser(inviteData);

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/users/invite',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(inviteData),
        }),
      );
      expect(result.mustChangePassword).toBe(true);
    });

    it('lanza error sin email', async () => {
      await expect(
        authClient.inviteUser({ email: '', firstName: 'A', lastName: 'B', tenantId: 't' }),
      ).rejects.toThrow('email es requerido');
    });

    it('propaga mensaje de error del backend (ej: email duplicado)', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 409,
        statusText: 'Conflict',
        json: async () => ({ message: 'El usuario con email x@x.cl ya existe' }),
      } as Response);

      await expect(
        authClient.inviteUser({
          email: 'x@x.cl',
          firstName: 'A',
          lastName: 'B',
          tenantId: 'tenant-1',
        }),
      ).rejects.toThrow('ya existe');
    });
  });

  describe('updateUser', () => {
    it('envía PUT a /users/:id con profileId', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'ok', profileId: 'profile-1', userId: 'user-1' }),
      } as Response);

      await authClient.updateUser('profile-1', { firstName: 'Ana María' });

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/users/profile-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ firstName: 'Ana María' }),
        }),
      );
    });
  });

  describe('deleteUser / reactivateUser / resendInvitation', () => {
    it('deleteUser envía DELETE a /users/:id', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'ok', userId: 'user-1' }),
      } as Response);

      await authClient.deleteUser('profile-1');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/users/profile-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('reactivateUser envía PUT a /users/:id/reactivate', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'ok' }),
      } as Response);

      await authClient.reactivateUser('profile-1');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/users/profile-1/reactivate',
        expect.objectContaining({ method: 'PUT' }),
      );
    });

    it('resendInvitation envía POST a /users/:id/resend-invitation', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'ok' }),
      } as Response);

      await authClient.resendInvitation('profile-1');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/users/profile-1/resend-invitation',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });
});
