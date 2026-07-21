import { TGTAdminClient } from '../tgtone-admin-client';
import type { UserProfile } from '../tgtone-admin-client';

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

describe('TGTAdminClient (server-side)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor — validación de modos de auth', () => {
    it('lanza error sin coreApiUrl', () => {
      expect(() => new TGTAdminClient({ coreApiUrl: '', token: 'jwt' })).toThrow(
        'coreApiUrl es requerido',
      );
    });

    it('lanza error sin token ni maintenanceKey', () => {
      expect(() => new TGTAdminClient({ coreApiUrl: 'http://core.test' })).toThrow(
        'exactamente uno',
      );
    });

    it('lanza error con ambos token y maintenanceKey', () => {
      expect(
        () =>
          new TGTAdminClient({
            coreApiUrl: 'http://core.test',
            token: 'jwt',
            maintenanceKey: 'key',
          }),
      ).toThrow('exactamente uno');
    });

    it('normaliza coreApiUrl quitando /api y trailing slash', () => {
      const admin = new TGTAdminClient({
        coreApiUrl: 'http://core.test/api/',
        token: 'jwt',
      });
      // @ts-expect-error — acceso a privado para test
      expect(admin.config.coreApiUrl).toBe('http://core.test');
    });
  });

  describe('modo token (JWT)', () => {
    it('envía header Authorization Bearer', async () => {
      const admin = new TGTAdminClient({
        coreApiUrl: 'http://core.test',
        token: 'jwt-admin',
      });

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => [mockUserProfile],
      } as Response);

      await admin.listUsers('tenant-1');

      expect(fetch).toHaveBeenCalledWith(
        'http://core.test/api/v1/users?tenantId=tenant-1',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer jwt-admin' }),
        }),
      );
    });
  });

  describe('modo maintenanceKey', () => {
    it('envía header x-maintenance-key', async () => {
      const admin = new TGTAdminClient({
        coreApiUrl: 'http://core.test',
        maintenanceKey: 'maintenance-secret',
      });

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response);

      await admin.listUsers('tenant-1');

      expect(fetch).toHaveBeenCalledWith(
        'http://core.test/api/v1/users?tenantId=tenant-1',
        expect.objectContaining({
          headers: expect.objectContaining({ 'x-maintenance-key': 'maintenance-secret' }),
        }),
      );
    });

    it('no envía header Authorization en modo maintenance key', async () => {
      const admin = new TGTAdminClient({
        coreApiUrl: 'http://core.test',
        maintenanceKey: 'maintenance-secret',
      });

      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response);
      fetchSpy.mockClear();

      await admin.listUsers('tenant-1');

      const headers = fetchSpy.mock.calls[0][1].headers;
      expect(headers.Authorization).toBeUndefined();
      expect(headers['x-maintenance-key']).toBe('maintenance-secret');
    });
  });

  describe('métodos', () => {
    const admin = () =>
      new TGTAdminClient({ coreApiUrl: 'http://core.test', maintenanceKey: 'key' });

    it('inviteUser envía POST con body JSON', async () => {
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

      const result = await admin().inviteUser(inviteData);

      expect(fetch).toHaveBeenCalledWith(
        'http://core.test/api/v1/users/invite',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(inviteData),
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        }),
      );
      expect(result.temporaryPassword).toBe('temp123');
    });

    it('updateUser envía PUT a /users/:profileId', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'ok', profileId: 'profile-1', userId: 'user-1' }),
      } as Response);

      await admin().updateUser('profile-1', {
        applicationAccess: [{ applicationId: 'app-1', roleId: 'role-2' }],
      });

      expect(fetch).toHaveBeenCalledWith(
        'http://core.test/api/v1/users/profile-1',
        expect.objectContaining({ method: 'PUT' }),
      );
    });

    it('deleteUser envía DELETE', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'ok', userId: 'user-1' }),
      } as Response);

      await admin().deleteUser('profile-1');

      expect(fetch).toHaveBeenCalledWith(
        'http://core.test/api/v1/users/profile-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('getUsersMap excluye usuarios inactivos', async () => {
      const deleted: UserProfile = {
        ...mockUserProfile,
        userId: 'user-2',
        isActive: false,
        deletedAt: '2026-06-01T00:00:00.000Z',
      };

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => [mockUserProfile, deleted],
      } as Response);

      const map = await admin().getUsersMap('tenant-1');

      expect(Object.keys(map)).toHaveLength(1);
      expect(map['user-1'].displayName).toBe('Ana González');
    });

    it('propaga mensaje de error del backend', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 409,
        statusText: 'Conflict',
        json: async () => ({ message: 'El usuario ya existe' }),
      } as Response);

      await expect(
        admin().inviteUser({
          email: 'x@x.cl',
          firstName: 'A',
          lastName: 'B',
          tenantId: 'tenant-1',
        }),
      ).rejects.toThrow('ya existe');
    });
  });
});
