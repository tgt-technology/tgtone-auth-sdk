import { 
  createAxiosInterceptor, 
  createAuthFetch, 
  handleAuthError 
} from '../interceptor';
import { TGTAuthClient, AuthError } from '../tgtone-auth-client';

const mockAuthClient = {
  getToken: jest.fn().mockReturnValue('mock-token'),
  refreshAccessToken: jest.fn().mockResolvedValue(false),
  stopHeartbeat: jest.fn(),
  getBlockedRedirectUrl: jest.fn((error: AuthError) => 
    `http://localhost:3001/blocked?type=${error.code.toLowerCase()}&message=${encodeURIComponent(error.message)}`
  ),
} as unknown as TGTAuthClient;

describe('HTTP Interceptor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createAxiosInterceptor', () => {
    it('debe crear interceptor y retornar función de limpieza', () => {
      const mockAxios = {
        interceptors: {
          response: {
            use: jest.fn().mockReturnValue(123),
            eject: jest.fn(),
          },
        },
      };

      const removeInterceptor = createAxiosInterceptor(mockAxios, mockAuthClient);

      expect(mockAxios.interceptors.response.use).toHaveBeenCalled();
      expect(typeof removeInterceptor).toBe('function');

      removeInterceptor();
      expect(mockAxios.interceptors.response.eject).toHaveBeenCalledWith(123);
    });

    it('debe manejar respuesta exitosa sin modificarla', async () => {
      const mockResponse = { data: { test: 'data' } };
      let capturedOnFulfilled: (response: unknown) => unknown;
      
      const mockAxios = {
        interceptors: {
          response: {
            use: jest.fn((onFulfilled) => {
              capturedOnFulfilled = onFulfilled;
              return 123;
            }),
            eject: jest.fn(),
          },
        },
      };

      createAxiosInterceptor(mockAxios, mockAuthClient);

      const result = await capturedOnFulfilled!(mockResponse);
      expect(result).toEqual(mockResponse);
    });

    it('debe manejar error 401 con código de revocación', async () => {
      let capturedOnRejected: (error: unknown) => Promise<unknown>;
      
      const mockAxios = {
        interceptors: {
          response: {
            use: jest.fn((_, onRejected) => {
              capturedOnRejected = onRejected;
              return 123;
            }),
            eject: jest.fn(),
          },
        },
      };

      createAxiosInterceptor(mockAxios, mockAuthClient);

      const error = {
        response: {
          status: 401,
          data: {
            code: 'TENANT_INACTIVE',
            message: 'Empresa suspendida',
          },
        },
        config: { url: '/api/test' },
      };

      await expect(capturedOnRejected!(error)).rejects.toBeDefined();
      
      expect(mockAuthClient.stopHeartbeat).toHaveBeenCalled();
      expect(window.location.href).toContain('/blocked');
    });

    it('debe ignorar URLs excluidas', async () => {
      let capturedOnRejected: (error: unknown) => Promise<unknown>;
      
      const mockAxios = {
        interceptors: {
          response: {
            use: jest.fn((_, onRejected) => {
              capturedOnRejected = onRejected;
              return 123;
            }),
            eject: jest.fn(),
          },
        },
      };

      createAxiosInterceptor(mockAxios, mockAuthClient, {
        excludeUrls: ['/public/health'],
      });

      const error = {
        response: {
          status: 401,
          data: {
            code: 'TENANT_INACTIVE',
            message: 'Empresa suspendida',
          },
        },
        config: { url: '/public/health' },
      };

      await expect(capturedOnRejected!(error)).rejects.toBeDefined();
      
      expect(mockAuthClient.stopHeartbeat).not.toHaveBeenCalled();
    });

    it('debe usar callback personalizado onAuthError', async () => {
      const onAuthErrorMock = jest.fn();
      let capturedOnRejected: (error: unknown) => Promise<unknown>;
      
      const mockAxios = {
        interceptors: {
          response: {
            use: jest.fn((_, onRejected) => {
              capturedOnRejected = onRejected;
              return 123;
            }),
            eject: jest.fn(),
          },
        },
      };

      createAxiosInterceptor(mockAxios, mockAuthClient, {
        onAuthError: onAuthErrorMock,
      });

      const error = {
        response: {
          status: 401,
          data: {
            code: 'USER_INACTIVE',
            message: 'Cuenta desactivada',
          },
        },
        config: { url: '/api/test' },
      };

      await expect(capturedOnRejected!(error)).rejects.toBeDefined();
      
      expect(onAuthErrorMock).toHaveBeenCalledWith({
        code: 'USER_INACTIVE',
        message: 'Cuenta desactivada',
      });
    });

    it('debe manejar error 401 con APP_SUBSCRIPTION_LOCKED', async () => {
      let capturedOnRejected: (error: unknown) => Promise<unknown>;

      const mockAxios = {
        interceptors: {
          response: {
            use: jest.fn((_, onRejected) => {
              capturedOnRejected = onRejected;
              return 123;
            }),
            eject: jest.fn(),
          },
        },
      };

      createAxiosInterceptor(mockAxios, mockAuthClient);

      const error = {
        response: {
          status: 401,
          data: {
            code: 'APP_SUBSCRIPTION_LOCKED',
            message: 'Suscripción bloqueada',
          },
        },
        config: { url: '/api/test' },
      };

      await expect(capturedOnRejected!(error)).rejects.toBeDefined();

      expect(mockAuthClient.stopHeartbeat).toHaveBeenCalled();
      expect(window.location.href).toContain('/blocked');
    });

    it('debe manejar error 401 con TRIAL_EXPIRED', async () => {
      let capturedOnRejected: (error: unknown) => Promise<unknown>;

      const mockAxios = {
        interceptors: {
          response: {
            use: jest.fn((_, onRejected) => {
              capturedOnRejected = onRejected;
              return 123;
            }),
            eject: jest.fn(),
          },
        },
      };

      createAxiosInterceptor(mockAxios, mockAuthClient);

      const error = {
        response: {
          status: 401,
          data: {
            code: 'TRIAL_EXPIRED',
            message: 'Período de prueba expirado',
          },
        },
        config: { url: '/api/test' },
      };

      await expect(capturedOnRejected!(error)).rejects.toBeDefined();

      expect(mockAuthClient.stopHeartbeat).toHaveBeenCalled();
      expect(window.location.href).toContain('/blocked');
    });

    it('debe pasar errores no relacionados con auth', async () => {
      let capturedOnRejected: (error: unknown) => Promise<unknown>;
      
      const mockAxios = {
        interceptors: {
          response: {
            use: jest.fn((_, onRejected) => {
              capturedOnRejected = onRejected;
              return 123;
            }),
            eject: jest.fn(),
          },
        },
      };

      createAxiosInterceptor(mockAxios, mockAuthClient);

      const error = {
        response: {
          status: 500,
          data: { message: 'Internal server error' },
        },
      };

      await expect(capturedOnRejected!(error)).rejects.toBeDefined();
      expect(mockAuthClient.stopHeartbeat).not.toHaveBeenCalled();
    });

    it('debe reintentar con token nuevo cuando recibe TOKEN_EXPIRED', async () => {
      let capturedOnRejected: (error: unknown) => Promise<unknown>;

      (mockAuthClient.refreshAccessToken as jest.Mock).mockResolvedValueOnce(true);
      (mockAuthClient.getToken as jest.Mock).mockReturnValueOnce('new-token');

      const mockRequest = jest.fn().mockResolvedValue({ data: 'success' });
      const mockAxios = {
        request: mockRequest,
        interceptors: {
          response: {
            use: jest.fn((_, onRejected) => {
              capturedOnRejected = onRejected;
              return 123;
            }),
            eject: jest.fn(),
          },
        },
      };

      createAxiosInterceptor(mockAxios, mockAuthClient);

      const error = {
        response: {
          status: 401,
          data: {
            code: 'TOKEN_EXPIRED',
            message: 'Token expirado',
          },
        },
        config: {
          url: '/api/test',
          headers: { Authorization: 'Bearer expired-token' },
        },
      };

      const result = await capturedOnRejected!(error);

      expect(mockAuthClient.refreshAccessToken).toHaveBeenCalled();
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer new-token',
          }),
        })
      );
      expect(result).toEqual({ data: 'success' });

      (mockAuthClient.getToken as jest.Mock).mockReturnValue('mock-token');
    });

    it('debe rechazar la promise cuando TOKEN_EXPIRED y refresh falla', async () => {
      let capturedOnRejected: (error: unknown) => Promise<unknown>;

      (mockAuthClient.refreshAccessToken as jest.Mock).mockResolvedValueOnce(false);

      const mockAxios = {
        interceptors: {
          response: {
            use: jest.fn((_, onRejected) => {
              capturedOnRejected = onRejected;
              return 123;
            }),
            eject: jest.fn(),
          },
        },
      };

      createAxiosInterceptor(mockAxios, mockAuthClient);

      const error = {
        response: {
          status: 401,
          data: {
            code: 'TOKEN_EXPIRED',
            message: 'Token expirado',
          },
        },
        config: { url: '/api/test' },
      };

      await expect(capturedOnRejected!(error)).rejects.toBeDefined();
      expect(mockAuthClient.refreshAccessToken).toHaveBeenCalled();
      expect(mockAuthClient.stopHeartbeat).not.toHaveBeenCalled();
    });
  });

  describe('createAuthFetch', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    it('debe agregar header Authorization si hay token', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        clone: () => ({ json: () => Promise.resolve({}) }),
      });
      
      global.fetch = mockFetch;

      const authFetch = createAuthFetch(mockAuthClient);
      await authFetch('/api/test');

      expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
        headers: expect.any(Headers),
      }));
    });

    it('debe manejar error 401 con código de revocación', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        clone: () => ({ 
          json: () => Promise.resolve({
            code: 'USER_INACTIVE',
            message: 'Cuenta desactivada',
          }) 
        }),
      });
      
      global.fetch = mockFetch;

      const authFetch = createAuthFetch(mockAuthClient);
      await authFetch('/api/test');

      expect(mockAuthClient.stopHeartbeat).toHaveBeenCalled();
      expect(window.location.href).toContain('/blocked');
    });

    it('debe ignorar URLs excluidas', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        clone: () => ({ 
          json: () => Promise.resolve({
            code: 'TENANT_INACTIVE',
            message: 'Empresa suspendida',
          }) 
        }),
      });
      
      global.fetch = mockFetch;

      const authFetch = createAuthFetch(mockAuthClient, {
        excludeUrls: ['/public/'],
      });
      
      await authFetch('/public/data');

      expect(mockAuthClient.stopHeartbeat).not.toHaveBeenCalled();
    });

    it('debe usar callback personalizado onAuthError', async () => {
      const onAuthErrorMock = jest.fn();

      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        clone: () => ({ 
          json: () => Promise.resolve({
            code: 'USER_INACTIVE',
            message: 'Cuenta desactivada',
          }) 
        }),
      });
      
      global.fetch = mockFetch;

      const authFetch = createAuthFetch(mockAuthClient, {
        onAuthError: onAuthErrorMock,
      });
      
      await authFetch('/api/test');

      expect(onAuthErrorMock).toHaveBeenCalledWith({
        code: 'USER_INACTIVE',
        message: 'Cuenta desactivada',
      });
    });

    it('debe retornar respuesta sin modificar si es exitosa', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'test' }),
      };
      
      const mockFetch = jest.fn().mockResolvedValue(mockResponse);
      global.fetch = mockFetch;

      const authFetch = createAuthFetch(mockAuthClient);
      const response = await authFetch('/api/test');

      expect(response).toBe(mockResponse);
    });

    it('debe reintentar con token nuevo cuando recibe TOKEN_EXPIRED', async () => {
      (mockAuthClient.getToken as jest.Mock)
        .mockReturnValueOnce('expired-token')
        .mockReturnValueOnce('new-token');
      (mockAuthClient.refreshAccessToken as jest.Mock).mockResolvedValueOnce(true);

      const tokenExpiredResponse = {
        ok: false,
        status: 401,
        clone: () => ({
          json: () => Promise.resolve({
            code: 'TOKEN_EXPIRED',
            message: 'Token expirado',
          })
        }),
      };

      const successResponse = {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'success' }),
      };

      const mockFetch = jest.fn()
        .mockResolvedValueOnce(tokenExpiredResponse)
        .mockResolvedValueOnce(successResponse);
      global.fetch = mockFetch;

      const authFetch = createAuthFetch(mockAuthClient);
      const response = await authFetch('/api/test');

      expect(mockAuthClient.refreshAccessToken).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenLastCalledWith('/api/test', expect.objectContaining({
        headers: expect.any(Headers),
      }));
      expect(response).toBe(successResponse);

      (mockAuthClient.getToken as jest.Mock).mockReturnValue('mock-token');
    });

    it('debe retornar response original cuando TOKEN_EXPIRED y refresh falla', async () => {
      (mockAuthClient.refreshAccessToken as jest.Mock).mockResolvedValueOnce(false);

      const tokenExpiredResponse = {
        ok: false,
        status: 401,
        clone: () => ({
          json: () => Promise.resolve({
            code: 'TOKEN_EXPIRED',
            message: 'Token expirado',
          })
        }),
      };

      const mockFetch = jest.fn().mockResolvedValue(tokenExpiredResponse);
      global.fetch = mockFetch;

      const authFetch = createAuthFetch(mockAuthClient);
      const response = await authFetch('/api/test');

      expect(mockAuthClient.refreshAccessToken).toHaveBeenCalled();
      expect(response).toBe(tokenExpiredResponse);
    });
  });

  describe('handleAuthError', () => {
    it('debe retornar false si no es error 401', () => {
      const error = {
        response: {
          status: 500,
          data: { message: 'Server error' },
        },
      };

      const result = handleAuthError(error, mockAuthClient);
      expect(result).toBe(false);
    });

    it('debe retornar false si no hay código de error', () => {
      const error = {
        response: {
          status: 401,
          data: { message: 'Unauthorized' },
        },
      };

      const result = handleAuthError(error, mockAuthClient);
      expect(result).toBe(false);
    });

    it('debe manejar error de revocación y retornar true', () => {
      const error = {
        response: {
          status: 401,
          data: {
            code: 'TENANT_INACTIVE',
            message: 'Empresa suspendida',
          },
        },
      };

      const result = handleAuthError(error, mockAuthClient);

      expect(result).toBe(true);
      expect(mockAuthClient.stopHeartbeat).toHaveBeenCalled();
      expect(window.location.href).toContain('/blocked');
    });

    it('debe usar callback onRevoked si se proporciona', () => {
      const onRevokedMock = jest.fn();

      const error = {
        response: {
          status: 401,
          data: {
            code: 'USER_INACTIVE',
            message: 'Cuenta desactivada',
          },
        },
      };

      const result = handleAuthError(error, mockAuthClient, {
        onRevoked: onRevokedMock,
      });

      expect(result).toBe(true);
      expect(onRevokedMock).toHaveBeenCalledWith({
        code: 'USER_INACTIVE',
        message: 'Cuenta desactivada',
      });
    });

    it('debe retornar false para códigos que no son de revocación', () => {
      const error = {
        response: {
          status: 401,
          data: {
            code: 'INVALID_TOKEN',
            message: 'Token inválido',
          },
        },
      };

      const result = handleAuthError(error, mockAuthClient);
      expect(result).toBe(false);
    });

    it('debe manejar APP_SUBSCRIPTION_LOCKED como error de bloqueo', () => {
      const error = {
        response: {
          status: 401,
          data: {
            code: 'APP_SUBSCRIPTION_LOCKED',
            message: 'Suscripción bloqueada',
          },
        },
      };

      const result = handleAuthError(error, mockAuthClient);

      expect(result).toBe(true);
      expect(mockAuthClient.stopHeartbeat).toHaveBeenCalled();
      expect(window.location.href).toContain('/blocked');
    });

    it('debe manejar TRIAL_EXPIRED como error de bloqueo', () => {
      const error = {
        response: {
          status: 401,
          data: {
            code: 'TRIAL_EXPIRED',
            message: 'Período de prueba expirado',
          },
        },
      };

      const result = handleAuthError(error, mockAuthClient);

      expect(result).toBe(true);
      expect(mockAuthClient.stopHeartbeat).toHaveBeenCalled();
      expect(window.location.href).toContain('/blocked');
    });
  });
});
