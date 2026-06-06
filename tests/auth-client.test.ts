import { TGTAuthClient } from '../tgtone-auth-client';
import type { TGTAuthConfig, SignupData, LoginData } from '../tgtone-auth-client';

// Función auxiliar para crear un JWT mock válido
function createMockJWT(payload: any): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  const signature = 'mock-signature';
  return `${header}.${body}.${signature}`;
}

describe('TGTAuthClient', () => {
  let authClient: TGTAuthClient;
  const mockConfig: TGTAuthConfig = {
    identityUrl: 'http://localhost:3001',
    appDomain: 'localhost:3000',
    debug: false
  };

  beforeEach(() => {
    authClient = new TGTAuthClient(mockConfig);
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe('TC-2.1: Signup', () => {
    it('debe crear una nueva cuenta exitosamente', async () => {
      const signupData: SignupData = {
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
        tenantName: 'Test Tenant'
      };

      const mockJwt = createMockJWT({
        sub: 'user-uuid',
        email: 'test@example.com',
        emailVerified: true,
        name: 'Test User',
        tenantId: 'tenant-uuid',
        tenantName: 'Test Tenant',
        roles: {},
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      const mockResponse = {
        token: mockJwt,
        accessToken: mockJwt,
        expiresIn: 3600,
        user: {
          id: 'user-uuid',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User'
        }
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await authClient.signup(signupData);

      expect(result.token).toBe(mockJwt);
      expect(result.user.email).toBe('test@example.com');
      expect(localStorage.getItem('tgtone_auth_token')).toBe(mockJwt);
    });

    it('debe manejar errores de signup', async () => {
      const signupData: SignupData = {
        email: 'existing@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
        tenantName: 'Test Tenant'
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Email ya registrado' })
      });

      await expect(authClient.signup(signupData)).rejects.toThrow('Email ya registrado');
    });
  });

  describe('TC-2.2: Login', () => {
    it('debe iniciar sesión exitosamente', async () => {
      const loginData: LoginData = {
        email: 'test@example.com',
        password: 'Password123!'
      };

      const mockJwt = createMockJWT({
        sub: 'user-uuid',
        email: 'test@example.com',
        emailVerified: true,
        name: 'Test User',
        tenantId: 'tenant-uuid',
        tenantName: 'Test Tenant',
        roles: {},
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      const mockResponse = {
        token: mockJwt,
        accessToken: mockJwt,
        expiresIn: 3600,
        user: {
          id: 'user-uuid',
          email: 'test@example.com'
        }
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await authClient.login(loginData);

      expect(result.token).toBe(mockJwt);
      expect(localStorage.getItem('tgtone_auth_token')).toBe(mockJwt);
    });

    it('debe almacenar refreshToken en localStorage al hacer login', async () => {
      const loginData: LoginData = {
        email: 'test@example.com',
        password: 'Password123!'
      };

      const mockJwt = createMockJWT({
        sub: 'user-uuid',
        email: 'test@example.com',
        emailVerified: true,
        name: 'Test User',
        tenantId: 'tenant-uuid',
        tenantName: 'Test Tenant',
        roles: {},
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      const mockResponse = {
        token: mockJwt,
        accessToken: mockJwt,
        expiresIn: 3600,
        refreshToken: 'rt-login-12345',
        user: {
          id: 'user-uuid',
          email: 'test@example.com'
        }
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      await authClient.login(loginData);

      expect(localStorage.getItem('tgtone_refresh_token')).toBe('rt-login-12345');
    });

    it('debe manejar credenciales inválidas', async () => {
      const loginData: LoginData = {
        email: 'test@example.com',
        password: 'WrongPassword'
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Credenciales inválidas' })
      });

      await expect(authClient.login(loginData)).rejects.toThrow('Credenciales inválidas');
    });
  });

  describe('TC-2.3: Logout', () => {
    it('debe cerrar sesión y limpiar token', async () => {
      localStorage.setItem('tgtone_auth_token', 'existing-token');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true
      });

      await authClient.logout();

      expect(localStorage.getItem('tgtone_auth_token')).toBeNull();
      expect(window.location.href).toContain('/login');
    });

    it('debe limpiar refreshToken de localStorage al hacer logout', async () => {
      localStorage.setItem('tgtone_auth_token', 'existing-token');
      localStorage.setItem('tgtone_refresh_token', 'rt-to-clear');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true
      });

      await authClient.logout();

      expect(localStorage.getItem('tgtone_refresh_token')).toBeNull();
    });
  });

  describe('TC-2.4: localLogout', () => {
    it('debe limpiar tokens sin redirigir al identity provider', async () => {
      localStorage.setItem('tgtone_auth_token', 'existing-token');
      localStorage.setItem('tgtone_refresh_token', 'rt-to-clear');
      localStorage.setItem('tgtone_temp_token', 'temp-to-clear');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true
      });

      const initialHref = window.location.href;
      await authClient.localLogout();

      expect(localStorage.getItem('tgtone_auth_token')).toBeNull();
      expect(localStorage.getItem('tgtone_refresh_token')).toBeNull();
      expect(localStorage.getItem('tgtone_temp_token')).toBeNull();
      expect(window.location.href).toBe(initialHref);
    });

    it('debe invalidar token en el backend cuando existe', async () => {
      localStorage.setItem('tgtone_auth_token', 'existing-token');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true
      });

      await authClient.localLogout();

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/auth/logout',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer existing-token',
          }),
        })
      );
    });

    it('debe limpiar todo incluso si el fetch falla', async () => {
      localStorage.setItem('tgtone_auth_token', 'existing-token');

      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      await authClient.localLogout();

      expect(localStorage.getItem('tgtone_auth_token')).toBeNull();
    });

    it('no debe hacer fetch de logout si no hay token', async () => {
      await authClient.localLogout();

      expect(global.fetch).not.toHaveBeenCalledWith(
        expect.stringContaining('/auth/logout'),
        expect.anything()
      );
      expect(localStorage.getItem('tgtone_auth_token')).toBeNull();
    });
  });

  describe('checkSession', () => {
    it('debe verificar sesión válida con backend', async () => {
      const mockJwt = createMockJWT({
        sub: 'user-uuid',
        email: 'test@example.com',
        emailVerified: true,
        name: 'Test User',
        tenantId: 'tenant-uuid',
        tenantName: 'Test Tenant',
        roles: {},
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      localStorage.setItem('tgtone_auth_token', mockJwt);

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            sub: 'user-uuid',
            email: 'test@example.com',
            tenantId: 'tenant-uuid',
            tenantName: 'Test Tenant',
            roles: {}
          }
        })
      });

      const session = await authClient.checkSession();

      expect(session).not.toBeNull();
      expect(session?.user.email).toBe('test@example.com');
    });

    it('debe retornar null si no hay token', async () => {
      const session = await authClient.checkSession();
      expect(session).toBeNull();
    });

    it('onAuthFailure sin redirect debe hacer redirectToLogin como fallback', async () => {
      const onAuthFailure = jest.fn(); // callback que NO redirige
      const client = new TGTAuthClient({ ...mockConfig, onAuthFailure });
      
      const session = await client.checkSession();
      
      // onAuthFailure debe haberse llamado
      expect(onAuthFailure).toHaveBeenCalledTimes(1);
      // Como onAuthFailure no redirigió, el SDK debe hacer redirectToLogin
      expect(window.location.href).not.toBe('http://localhost:3000/');
      // isRedirecting debe ser false después del fallback
      expect(client.isRedirecting()).toBe(false);
      expect(session).toBeNull();
    });

    it('onAuthFailure sin redirect desde subpagina /xxx/yyy/zzz debe redirigir a login', async () => {
      // Simular que el usuario está en una subpágina (ej: /tenants/settings)
      window.location.href = 'http://localhost:3000/tenants/settings';
      
      const onAuthFailure = jest.fn();
      const client = new TGTAuthClient({ ...mockConfig, onAuthFailure });
      
      const session = await client.checkSession();
      
      expect(onAuthFailure).toHaveBeenCalledTimes(1);
      // Debe redirigir a login, no quedarse en la subpágina
      expect(window.location.href).not.toBe('http://localhost:3000/tenants/settings');
      expect(client.isRedirecting()).toBe(false);
      expect(session).toBeNull();
    });

    it('onAuthFailure sin redirect desde URL con query params debe redirigir a login', async () => {
      // Simular URL con query params (ej: después de OAuth callback fallido)
      window.location.href = 'http://localhost:3000/auth/callback?code=expired&state=abc';
      
      const onAuthFailure = jest.fn();
      const client = new TGTAuthClient({ ...mockConfig, onAuthFailure });
      
      const session = await client.checkSession();
      
      expect(onAuthFailure).toHaveBeenCalledTimes(1);
      // Debe redirigir a login, no quedarse colgado con query params
      expect(window.location.href).not.toContain('/auth/callback');
      expect(window.location.href).not.toContain('code=');
      expect(client.isRedirecting()).toBe(false);
      expect(session).toBeNull();
    });

    it('onAuthFailure con redirect desde subpagina debe mantener isRedirecting true', async () => {
      window.location.href = 'http://localhost:3000/dashboard/settings';
      
      const onAuthFailure = jest.fn(() => {
        window.location.href = 'http://identity/login?error=session_expired';
      });
      const client = new TGTAuthClient({ ...mockConfig, onAuthFailure });
      
      const session = await client.checkSession();
      
      expect(onAuthFailure).toHaveBeenCalledTimes(1);
      // URL debe haber cambiado a identity
      expect(window.location.href).toBe('http://identity/login?error=session_expired');
      expect(client.isRedirecting()).toBe(true);
      expect(session).toBeNull();
    });

    it('onAuthFailure con redirect debe mantener isRedirecting true', async () => {
      const onAuthFailure = jest.fn(() => {
        window.location.href = 'http://identity/login';
      });
      const client = new TGTAuthClient({ ...mockConfig, onAuthFailure });
      
      const session = await client.checkSession();
      
      expect(onAuthFailure).toHaveBeenCalledTimes(1);
      // isRedirecting debe ser true porque onAuthFailure redirigió
      expect(client.isRedirecting()).toBe(true);
      expect(session).toBeNull();
    });

    it('debe refrescar token cuando JWT expirado y restaurar sesión', async () => {
      const expiredJwt = createMockJWT({
        sub: 'user-uuid',
        email: 'test@example.com',
        emailVerified: true,
        name: 'Test User',
        tenantId: 'tenant-uuid',
        tenantName: 'Test Tenant',
        roles: {},
        exp: Math.floor(Date.now() / 1000) - 300
      });

      const refreshedJwt = createMockJWT({
        sub: 'user-uuid',
        email: 'test@example.com',
        emailVerified: true,
        name: 'Test User',
        tenantId: 'tenant-uuid',
        tenantName: 'Test Tenant',
        roles: {},
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      localStorage.setItem('tgtone_auth_token', expiredJwt);
      localStorage.setItem('tgtone_refresh_token', 'valid-refresh-token');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accessToken: refreshedJwt,
          refreshToken: 'new-refresh-token'
        })
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            sub: 'user-uuid',
            email: 'test@example.com',
            tenantId: 'tenant-uuid',
            tenantName: 'Test Tenant',
            roles: {}
          }
        })
      });

      const session = await authClient.checkSession();

      expect(session).not.toBeNull();
      expect(session?.user.email).toBe('test@example.com');
      expect(localStorage.getItem('tgtone_auth_token')).toBe(refreshedJwt);
      expect(localStorage.getItem('tgtone_refresh_token')).toBe('new-refresh-token');
    });
  });

  describe('hasRole', () => {
    it('debe verificar si usuario tiene rol específico', () => {
      // Simular usuario con roles
      (authClient as any).currentUser = {
        roles: {
          console: ['admin', 'user'],
          zenith: ['viewer']
        }
      };

      expect(authClient.hasRole('console', 'admin')).toBe(true);
      expect(authClient.hasRole('console', 'superadmin')).toBe(false);
      expect(authClient.hasRole('zenith', 'viewer')).toBe(true);
      expect(authClient.hasRole('baco', 'admin')).toBe(false);
    });

    it('debe retornar false si no hay usuario', () => {
      expect(authClient.hasRole('console', 'admin')).toBe(false);
    });
  });

  describe('getRoles', () => {
    it('debe obtener roles de una app', () => {
      (authClient as any).currentUser = {
        roles: {
          console: ['admin', 'user'],
          zenith: ['viewer']
        }
      };

      expect(authClient.getRoles('console')).toEqual(['admin', 'user']);
      expect(authClient.getRoles('zenith')).toEqual(['viewer']);
      expect(authClient.getRoles('baco')).toEqual([]);
    });

    it('debe retornar array vacío si no hay usuario', () => {
      expect(authClient.getRoles('console')).toEqual([]);
    });
  });

  describe('hasAccessToApp', () => {
    it('debe verificar si usuario tiene acceso a app', () => {
      (authClient as any).currentUser = {
        roles: {
          console: ['admin'],
          zenith: ['viewer']
        }
      };

      expect(authClient.hasAccessToApp('console')).toBe(true);
      expect(authClient.hasAccessToApp('zenith')).toBe(true);
      expect(authClient.hasAccessToApp('baco')).toBe(false);
    });
  });

  describe('checkSession - SSO exchange', () => {
    it('debe llamar /auth/exchange cuando detecta token en URL', async () => {
      const urlJwt = createMockJWT({
        sub: 'user-uuid',
        email: 'test@example.com',
        emailVerified: true,
        name: 'Test User',
        tenantId: 'tenant-uuid',
        tenantName: 'Test Tenant',
        roles: {},
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      const exchangedJwt = createMockJWT({
        sub: 'user-uuid',
        email: 'test@example.com',
        emailVerified: true,
        name: 'Test User',
        tenantId: 'tenant-uuid',
        tenantName: 'Test Tenant',
        roles: {},
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      jest.spyOn(authClient as any, 'getTokenFromUrl').mockReturnValue(urlJwt);
      jest.spyOn(authClient as any, 'removeTokenFromUrl').mockImplementation(() => {});

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accessToken: exchangedJwt,
          refreshToken: 'exchanged-refresh-token'
        })
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            sub: 'user-uuid',
            email: 'test@example.com',
            tenantId: 'tenant-uuid',
            tenantName: 'Test Tenant',
            roles: {}
          }
        })
      });

      const session = await authClient.checkSession();

      const exchangeCalls = (global.fetch as jest.Mock).mock.calls.filter(
        (call: any[]) => call[0]?.includes?.('/auth/exchange')
      );
      expect(exchangeCalls.length).toBeGreaterThan(0);
      expect(localStorage.getItem('tgtone_refresh_token')).toBe('exchanged-refresh-token');
    });

    it('debe continuar normalmente si exchange falla', async () => {
      const urlJwt = createMockJWT({
        sub: 'user-uuid',
        email: 'test@example.com',
        emailVerified: true,
        name: 'Test User',
        tenantId: 'tenant-uuid',
        tenantName: 'Test Tenant',
        roles: {},
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      jest.spyOn(authClient as any, 'getTokenFromUrl').mockReturnValue(urlJwt);
      jest.spyOn(authClient as any, 'removeTokenFromUrl').mockImplementation(() => {});

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ message: 'Server error' })
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            sub: 'user-uuid',
            email: 'test@example.com',
            tenantId: 'tenant-uuid',
            tenantName: 'Test Tenant',
            roles: {}
          }
        })
      });

      const session = await authClient.checkSession();

      expect(session).not.toBeNull();
      expect(session?.user.email).toBe('test@example.com');
    });

    it('no debe llamar exchange si no hay token en URL', async () => {
      const mockJwt = createMockJWT({
        sub: 'user-uuid',
        email: 'test@example.com',
        emailVerified: true,
        name: 'Test User',
        tenantId: 'tenant-uuid',
        tenantName: 'Test Tenant',
        roles: {},
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      localStorage.setItem('tgtone_auth_token', mockJwt);

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            sub: 'user-uuid',
            email: 'test@example.com',
            tenantId: 'tenant-uuid',
            tenantName: 'Test Tenant',
            roles: {}
          }
        })
      });

      await authClient.checkSession();

      const exchangeCalls = (global.fetch as jest.Mock).mock.calls.filter(
        (call: any[]) => call[0]?.includes?.('/auth/exchange')
      );
      expect(exchangeCalls).toHaveLength(0);
    });
  });

  describe('checkSessionSilent - refresh on expiry', () => {
    it('debe intentar refresh cuando JWT expirado', async () => {
      const expiredJwt = createMockJWT({
        sub: 'user-uuid',
        email: 'test@example.com',
        emailVerified: true,
        name: 'Test User',
        tenantId: 'tenant-uuid',
        tenantName: 'Test Tenant',
        roles: {},
        exp: Math.floor(Date.now() / 1000) - 300
      });

      const refreshedJwt = createMockJWT({
        sub: 'user-uuid',
        email: 'test@example.com',
        emailVerified: true,
        name: 'Test User',
        tenantId: 'tenant-uuid',
        tenantName: 'Test Tenant',
        roles: {},
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      localStorage.setItem('tgtone_auth_token', expiredJwt);
      localStorage.setItem('tgtone_refresh_token', 'valid-refresh-token');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accessToken: refreshedJwt,
          refreshToken: 'new-refresh-token'
        })
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            sub: 'user-uuid',
            email: 'test@example.com',
            tenantId: 'tenant-uuid',
            tenantName: 'Test Tenant',
            roles: {}
          }
        })
      });

      const session = await authClient.checkSessionSilent();

      expect(session).not.toBeNull();
      expect(session?.user.email).toBe('test@example.com');
      expect(localStorage.getItem('tgtone_auth_token')).toBe(refreshedJwt);
    });

    it('debe retornar null cuando refresh falla', async () => {
      const expiredJwt = createMockJWT({
        sub: 'user-uuid',
        email: 'test@example.com',
        emailVerified: true,
        name: 'Test User',
        tenantId: 'tenant-uuid',
        tenantName: 'Test Tenant',
        roles: {},
        exp: Math.floor(Date.now() / 1000) - 300
      });

      localStorage.setItem('tgtone_auth_token', expiredJwt);

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Invalid refresh token' })
      });

      const session = await authClient.checkSessionSilent();

      expect(session).toBeNull();
      expect(localStorage.getItem('tgtone_auth_token')).toBeNull();
    });

    it('debe retornar sesion cuando token valido sin validacion server', async () => {
      const validJwt = createMockJWT({
        sub: 'user-uuid',
        email: 'test@example.com',
        emailVerified: true,
        name: 'Test User',
        tenantId: 'tenant-uuid',
        tenantName: 'Test Tenant',
        roles: { console: ['admin'] },
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      localStorage.setItem('tgtone_auth_token', validJwt);

      const session = await authClient.checkSessionSilent(false);

      expect(session).not.toBeNull();
      expect(session?.user.email).toBe('test@example.com');
      expect(session?.user.roles.console).toContain('admin');
    });
  });
});
