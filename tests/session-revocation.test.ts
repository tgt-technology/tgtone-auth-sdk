import { TGTAuthClient, AuthError, AuthErrorCode } from '../tgtone-auth-client';

function createMockJWT(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  const signature = 'mock-signature';
  return `${header}.${body}.${signature}`;
}

jest.useFakeTimers();

describe('Session Monitor - TGTAuthClient', () => {
  let authClient: TGTAuthClient;
  const mockConfig = {
    identityUrl: 'http://localhost:3001',
    appDomain: 'localhost:3000',
    debug: false,
  };

  beforeEach(() => {
    authClient = new TGTAuthClient(mockConfig);
    localStorage.clear();
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  afterEach(() => {
    authClient.stopSessionMonitor();
  });

  describe('startSessionMonitor / stopSessionMonitor', () => {
    it('debe iniciar el session monitor con intervalo por defecto de 5 minutos', () => {
      const client = new TGTAuthClient({
        ...mockConfig,
        heartbeatIntervalMs: 300000,
      });

      localStorage.setItem('tgtone_auth_token', 'valid-token');

      client.startSessionMonitor();
      expect(client.isSessionMonitorActive()).toBe(true);

      client.stopSessionMonitor();
    });

    it('debe detener el session monitor correctamente', () => {
      localStorage.setItem('tgtone_auth_token', 'valid-token');

      authClient.startSessionMonitor();
      expect(authClient.isSessionMonitorActive()).toBe(true);

      authClient.stopSessionMonitor();
      expect(authClient.isSessionMonitorActive()).toBe(false);
    });

    it('no debe iniciar session monitor si el intervalo es 0', () => {
      const client = new TGTAuthClient({
        ...mockConfig,
        heartbeatIntervalMs: 0,
      });

      client.startSessionMonitor();
      expect(client.isSessionMonitorActive()).toBe(false);
    });

    it('no debe iniciar session monitor si ya está corriendo', () => {
      localStorage.setItem('tgtone_auth_token', 'valid-token');

      authClient.startSessionMonitor();
      authClient.startSessionMonitor();

      expect(authClient.isSessionMonitorActive()).toBe(true);
    });

    it('debe detener session monitor si no hay token', async () => {
      authClient.startSessionMonitor();

      jest.advanceTimersByTime(300000);
      await Promise.resolve();

      expect(authClient.isSessionMonitorActive()).toBe(false);
    });

    it('debe detener session monitor si el token no se puede decodificar', async () => {
      localStorage.setItem('tgtone_auth_token', 'not-a-jwt');

      authClient.startSessionMonitor();

      jest.advanceTimersByTime(300000);
      await Promise.resolve();

      expect(authClient.isSessionMonitorActive()).toBe(false);
    });

    it('debe continuar sin network calls si el token no está próximo a expirar', async () => {
      const mockJwt = createMockJWT({
        sub: 'user-uuid',
        email: 'test@example.com',
        tenantId: 'tenant-uuid',
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hora
      });

      localStorage.setItem('tgtone_auth_token', mockJwt);

      const client = new TGTAuthClient({
        ...mockConfig,
        heartbeatIntervalMs: 1000,
      });

      client.startSessionMonitor();

      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();

      expect(global.fetch).not.toHaveBeenCalled();
      expect(client.isSessionMonitorActive()).toBe(true);

      client.stopSessionMonitor();
    });
  });

  describe('refreshAccessToken via session monitor', () => {
    it('debe llamar refreshAccessToken cuando el token está próximo a expirar', async () => {
      const oldToken = createMockJWT({
        sub: 'user-uuid',
        email: 'test@example.com',
        tenantId: 'tenant-uuid',
        exp: Math.floor(Date.now() / 1000) + 60, // 1 minuto (menos de 5 min)
      });

      const newToken = createMockJWT({
        sub: 'user-uuid',
        email: 'test@example.com',
        tenantId: 'tenant-uuid',
        exp: Math.floor(Date.now() / 1000) + 3600,
        name: 'Test User',
        emailVerified: true,
        tenantName: 'Test Tenant',
        roles: { console: ['admin'] },
      });

      localStorage.setItem('tgtone_auth_token', oldToken);
      localStorage.setItem('tgtone_refresh_token', 'valid-refresh-token');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accessToken: newToken,
          refreshToken: 'new-refresh-token',
        }),
      });

      const client = new TGTAuthClient({
        ...mockConfig,
        heartbeatIntervalMs: 1000,
      });

      client.startSessionMonitor();

      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/auth/refresh',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ refreshToken: 'valid-refresh-token' }),
        })
      );
      expect(localStorage.getItem('tgtone_auth_token')).toBe(newToken);
      expect(localStorage.getItem('tgtone_refresh_token')).toBe('new-refresh-token');

      client.stopSessionMonitor();
    });

    it('debe ejecutar onSessionRevoked cuando refresh retorna TENANT_INACTIVE', async () => {
      const onRevokedMock = jest.fn();

      const mockJwt = createMockJWT({
        sub: 'user-uuid',
        email: 'test@example.com',
        tenantId: 'tenant-uuid',
        exp: Math.floor(Date.now() / 1000) + 60,
      });

      localStorage.setItem('tgtone_auth_token', mockJwt);
      localStorage.setItem('tgtone_refresh_token', 'valid-refresh-token');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          code: 'TENANT_INACTIVE',
          message: 'Tu empresa está suspendida',
        }),
      });

      const client = new TGTAuthClient({
        ...mockConfig,
        onSessionRevoked: onRevokedMock,
        heartbeatIntervalMs: 1000,
      });

      client.startSessionMonitor();

      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(onRevokedMock).toHaveBeenCalledWith({
        code: 'TENANT_INACTIVE',
        message: 'Tu empresa está suspendida',
      });

      client.stopSessionMonitor();
    });

    it('debe ejecutar onSessionRevoked cuando refresh retorna USER_INACTIVE', async () => {
      const onRevokedMock = jest.fn();

      const mockJwt = createMockJWT({
        sub: 'user-uuid',
        email: 'test@example.com',
        tenantId: 'tenant-uuid',
        exp: Math.floor(Date.now() / 1000) + 60,
      });

      localStorage.setItem('tgtone_auth_token', mockJwt);
      localStorage.setItem('tgtone_refresh_token', 'valid-refresh-token');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          code: 'USER_INACTIVE',
          message: 'Tu cuenta ha sido desactivada',
        }),
      });

      const client = new TGTAuthClient({
        ...mockConfig,
        onSessionRevoked: onRevokedMock,
        heartbeatIntervalMs: 1000,
      });

      client.startSessionMonitor();

      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(onRevokedMock).toHaveBeenCalledWith({
        code: 'USER_INACTIVE',
        message: 'Tu cuenta ha sido desactivada',
      });

      client.stopSessionMonitor();
    });

    it('debe ejecutar onSessionRevoked cuando refresh retorna APP_SUBSCRIPTION_LOCKED', async () => {
      const onRevokedMock = jest.fn();

      const mockJwt = createMockJWT({
        sub: 'user-uuid',
        email: 'test@example.com',
        tenantId: 'tenant-uuid',
        exp: Math.floor(Date.now() / 1000) + 60,
      });

      localStorage.setItem('tgtone_auth_token', mockJwt);
      localStorage.setItem('tgtone_refresh_token', 'valid-refresh-token');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          code: 'APP_SUBSCRIPTION_LOCKED',
          message: 'Suscripción bloqueada',
        }),
      });

      const client = new TGTAuthClient({
        ...mockConfig,
        onSessionRevoked: onRevokedMock,
        heartbeatIntervalMs: 1000,
      });

      client.startSessionMonitor();

      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(onRevokedMock).toHaveBeenCalledWith({
        code: 'APP_SUBSCRIPTION_LOCKED',
        message: 'Suscripción bloqueada',
      });

      client.stopSessionMonitor();
    });

    it('debe ejecutar onSessionRevoked cuando refresh retorna TRIAL_EXPIRED', async () => {
      const onRevokedMock = jest.fn();

      const mockJwt = createMockJWT({
        sub: 'user-uuid',
        email: 'test@example.com',
        tenantId: 'tenant-uuid',
        exp: Math.floor(Date.now() / 1000) + 60,
      });

      localStorage.setItem('tgtone_auth_token', mockJwt);
      localStorage.setItem('tgtone_refresh_token', 'valid-refresh-token');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          code: 'TRIAL_EXPIRED',
          message: 'Período de prueba expirado',
        }),
      });

      const client = new TGTAuthClient({
        ...mockConfig,
        onSessionRevoked: onRevokedMock,
        heartbeatIntervalMs: 1000,
      });

      client.startSessionMonitor();

      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(onRevokedMock).toHaveBeenCalledWith({
        code: 'TRIAL_EXPIRED',
        message: 'Período de prueba expirado',
      });

      client.stopSessionMonitor();
    });

    it('debe ignorar errores de red durante refresh', async () => {
      const onRevokedMock = jest.fn();

      const mockJwt = createMockJWT({
        sub: 'user-uuid',
        email: 'test@example.com',
        tenantId: 'tenant-uuid',
        exp: Math.floor(Date.now() / 1000) + 60,
      });

      localStorage.setItem('tgtone_auth_token', mockJwt);
      localStorage.setItem('tgtone_refresh_token', 'valid-refresh-token');

      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const client = new TGTAuthClient({
        ...mockConfig,
        onSessionRevoked: onRevokedMock,
        heartbeatIntervalMs: 1000,
      });

      client.startSessionMonitor();

      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(onRevokedMock).not.toHaveBeenCalled();
      expect(client.isSessionMonitorActive()).toBe(true);

      client.stopSessionMonitor();
    });

    it('debe limpiar token cuando refresh retorna revocación', async () => {
      const mockJwt = createMockJWT({
        sub: 'user-uuid',
        email: 'test@example.com',
        tenantId: 'tenant-uuid',
        exp: Math.floor(Date.now() / 1000) + 60,
      });

      localStorage.setItem('tgtone_auth_token', mockJwt);
      localStorage.setItem('tgtone_refresh_token', 'valid-refresh-token');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          code: 'USER_INACTIVE',
          message: 'Cuenta desactivada',
        }),
      });

      const client = new TGTAuthClient({
        ...mockConfig,
        heartbeatIntervalMs: 1000,
      });

      client.startSessionMonitor();

      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(localStorage.getItem('tgtone_auth_token')).toBeNull();
      expect(localStorage.getItem('tgtone_refresh_token')).toBeNull();

      client.stopSessionMonitor();
    });

    it('debe redirigir a blocked si no hay callback personalizado', async () => {
      const mockJwt = createMockJWT({
        sub: 'user-uuid',
        email: 'test@example.com',
        tenantId: 'tenant-uuid',
        exp: Math.floor(Date.now() / 1000) + 60,
      });

      localStorage.setItem('tgtone_auth_token', mockJwt);
      localStorage.setItem('tgtone_refresh_token', 'valid-refresh-token');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          code: 'TENANT_INACTIVE',
          message: 'Empresa suspendida',
        }),
      });

      const client = new TGTAuthClient({
        ...mockConfig,
        heartbeatIntervalMs: 1000,
      });

      client.startSessionMonitor();

      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(window.location.href).toContain('/blocked');

      client.stopSessionMonitor();
    });
  });

  describe('refreshAccessToken (directo)', () => {
    it('debe retornar false si no hay refresh token', async () => {
      localStorage.setItem('tgtone_auth_token', 'some-token');

      const result = await authClient.refreshAccessToken();

      expect(result).toBe(false);
    });

    it('debe actualizar tokens en localStorage cuando refresh es exitoso', async () => {
      const oldToken = createMockJWT({
        sub: 'user-uuid',
        email: 'test@example.com',
        tenantId: 'tenant-uuid',
        exp: Math.floor(Date.now() / 1000) + 60,
      });

      const newToken = createMockJWT({
        sub: 'user-uuid',
        email: 'test@example.com',
        tenantId: 'tenant-uuid',
        exp: Math.floor(Date.now() / 1000) + 3600,
        name: 'Test User',
        emailVerified: true,
        tenantName: 'Test Tenant',
        roles: { console: ['admin'] },
      });

      localStorage.setItem('tgtone_auth_token', oldToken);
      localStorage.setItem('tgtone_refresh_token', 'old-refresh');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accessToken: newToken,
          refreshToken: 'new-refresh',
        }),
      });

      const result = await authClient.refreshAccessToken();

      expect(result).toBe(true);
      expect(localStorage.getItem('tgtone_auth_token')).toBe(newToken);
      expect(localStorage.getItem('tgtone_refresh_token')).toBe('new-refresh');
    });

    it('debe retornar false cuando refresh falla con error genérico', async () => {
      localStorage.setItem('tgtone_auth_token', 'some-token');
      localStorage.setItem('tgtone_refresh_token', 'old-refresh');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ message: 'Internal error' }),
      });

      const result = await authClient.refreshAccessToken();

      expect(result).toBe(false);
    });
  });

  describe('getBlockedRedirectUrl', () => {
    it('debe generar URL correcta para TENANT_INACTIVE', () => {
      const error: AuthError = {
        code: 'TENANT_INACTIVE',
        message: 'Tu empresa está suspendida',
      };

      const url = authClient.getBlockedRedirectUrl(error);

      expect(url).toContain('http://localhost:3001/blocked?type=tenant');
      expect(url).toContain(encodeURIComponent('Tu empresa está suspendida'));
    });

    it('debe generar URL correcta para USER_INACTIVE', () => {
      const error: AuthError = {
        code: 'USER_INACTIVE',
        message: 'Tu cuenta ha sido desactivada',
      };

      const url = authClient.getBlockedRedirectUrl(error);

      expect(url).toContain('/blocked?type=user');
    });

    it('debe generar URL correcta para USER_NOT_FOUND', () => {
      const error: AuthError = {
        code: 'USER_NOT_FOUND',
        message: 'Usuario no encontrado',
      };

      const url = authClient.getBlockedRedirectUrl(error);

      expect(url).toContain('/blocked?type=user');
    });

    it('debe generar URL correcta para APP_SUBSCRIPTION_LOCKED', () => {
      const error: AuthError = {
        code: 'APP_SUBSCRIPTION_LOCKED',
        message: 'Suscripción bloqueada',
      };

      const url = authClient.getBlockedRedirectUrl(error);

      expect(url).toContain('/blocked?type=subscription');
    });

    it('debe generar URL correcta para TRIAL_EXPIRED', () => {
      const error: AuthError = {
        code: 'TRIAL_EXPIRED',
        message: 'Período de prueba expirado',
      };

      const url = authClient.getBlockedRedirectUrl(error);

      expect(url).toContain('/blocked?type=trial');
    });
  });

  describe('Configuración de heartbeatIntervalMs', () => {
    it('debe usar intervalo personalizado', () => {
      const client = new TGTAuthClient({
        ...mockConfig,
        heartbeatIntervalMs: 60000,
      });

      localStorage.setItem('tgtone_auth_token', 'valid-token');

      client.startSessionMonitor();
      expect(client.isSessionMonitorActive()).toBe(true);

      client.stopSessionMonitor();
    });

    it('debe usar intervalo por defecto de 5 minutos si no se especifica', () => {
      const client = new TGTAuthClient(mockConfig);
      expect(client).toBeDefined();
    });
  });

  describe('Aliases deprecados (heartbeat)', () => {
    it('startHeartbeat delega a startSessionMonitor', () => {
      localStorage.setItem('tgtone_auth_token', 'valid-token');

      authClient.startHeartbeat();
      expect(authClient.isSessionMonitorActive()).toBe(true);
      expect(authClient.isHeartbeatActive()).toBe(true);

      authClient.stopHeartbeat();
    });

    it('stopHeartbeat delega a stopSessionMonitor', () => {
      localStorage.setItem('tgtone_auth_token', 'valid-token');

      authClient.startSessionMonitor();
      authClient.stopHeartbeat();

      expect(authClient.isSessionMonitorActive()).toBe(false);
      expect(authClient.isHeartbeatActive()).toBe(false);
    });
  });
});
