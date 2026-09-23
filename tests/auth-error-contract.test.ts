import {
  TGTAuthClient,
  AuthError,
  extractAuthCode,
  extractAuthMessage,
  isUnrecoverableRefreshCode,
  UNRECOVERABLE_REFRESH_CODES,
} from '../tgtone-auth-client';
import { createAxiosInterceptor, handleAuthError } from '../interceptor';

jest.useFakeTimers();

function createMockJWT(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.mock-signature`;
}

/** Forma nueva del core: código de dominio en la raíz, message string. */
const flatError = (code: string) => ({
  statusCode: 401,
  message: 'Texto humano',
  error: 'Unauthorized',
  code,
});

/** Forma previa del core: código de dominio anidado en message. */
const nestedError = (code: string) => ({
  statusCode: 401,
  message: { code, message: 'Texto humano' },
  error: 'Unauthorized',
  code: 'UNAUTHORIZED',
});

describe('Contrato de error de auth - lectura tolerante', () => {
  describe('extractAuthCode', () => {
    it('lee el código de dominio de la forma plana', () => {
      expect(extractAuthCode(flatError('ACCESS_REVOKED'))).toBe('ACCESS_REVOKED');
    });

    it('lee el código de dominio de la forma anidada', () => {
      expect(extractAuthCode(nestedError('INVALID_REFRESH_TOKEN'))).toBe('INVALID_REFRESH_TOKEN');
    });

    it('resuelve el mismo código con las dos formas del core', () => {
      expect(extractAuthCode(flatError('SESSION_EXPIRED'))).toBe(
        extractAuthCode(nestedError('SESSION_EXPIRED'))
      );
    });

    it('devuelve el genérico cuando no hay código de dominio', () => {
      expect(extractAuthCode({ code: 'UNAUTHORIZED', message: 'Texto humano' })).toBe('UNAUTHORIZED');
    });

    it('devuelve undefined cuando no hay código', () => {
      expect(extractAuthCode({ message: 'Texto humano' })).toBeUndefined();
      expect(extractAuthCode(null)).toBeUndefined();
      expect(extractAuthCode(undefined)).toBeUndefined();
    });

    it('ignora códigos que no son string', () => {
      expect(extractAuthCode({ code: 401, message: 'Texto humano' })).toBeUndefined();
    });
  });

  describe('extractAuthMessage', () => {
    it('lee el message string de la forma plana', () => {
      expect(extractAuthMessage(flatError('ACCESS_REVOKED'))).toBe('Texto humano');
    });

    it('lee el message anidado de la forma previa', () => {
      expect(extractAuthMessage(nestedError('ACCESS_REVOKED'))).toBe('Texto humano');
    });

    it('devuelve undefined cuando no hay message legible', () => {
      expect(extractAuthMessage({ code: 'UNAUTHORIZED' })).toBeUndefined();
      expect(extractAuthMessage(null)).toBeUndefined();
    });
  });

  describe('isUnrecoverableRefreshCode', () => {
    it('reconoce los códigos que dejan el refresh token inservible', () => {
      UNRECOVERABLE_REFRESH_CODES.forEach(code => {
        expect(isUnrecoverableRefreshCode(code)).toBe(true);
      });
    });

    it('no marca códigos transitorios ni desconocidos', () => {
      expect(isUnrecoverableRefreshCode('TOKEN_EXPIRED')).toBe(false);
      expect(isUnrecoverableRefreshCode('ACCESS_REVOKED')).toBe(false);
      expect(isUnrecoverableRefreshCode(undefined)).toBe(false);
    });
  });
});

describe('Descarte del refresh token por código (no por status)', () => {
  const mockConfig = {
    coreApiUrl: 'http://localhost:3001',
    appDomain: 'localhost:3000',
    debug: false,
  };

  let authClient: TGTAuthClient;

  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    jest.clearAllTimers();
    localStorage.setItem('tgtone_auth_token', 'some-token');
    localStorage.setItem('tgtone_refresh_token', 'old-refresh');
  });

  afterEach(() => {
    authClient?.stopSessionMonitor();
  });

  it('mantiene el refresh token ante un 5xx (deploy o reinicio)', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({ message: 'Bad Gateway' }),
    });

    authClient = new TGTAuthClient(mockConfig);
    const result = await authClient.refreshAccessToken();

    expect(result).toBe(false);
    expect(localStorage.getItem('tgtone_refresh_token')).toBe('old-refresh');
  });

  it('mantiene el refresh token ante un 401 sin código legible', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Texto humano' }),
    });

    authClient = new TGTAuthClient(mockConfig);
    const result = await authClient.refreshAccessToken();

    expect(result).toBe(false);
    expect(localStorage.getItem('tgtone_refresh_token')).toBe('old-refresh');
  });

  it('descarta el refresh token cuando el código dice que ya no sirve', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => nestedError('SESSION_EXPIRED'),
    });

    authClient = new TGTAuthClient({ ...mockConfig, onSessionRevoked: jest.fn() });
    const result = await authClient.refreshAccessToken();

    expect(result).toBe(false);
    expect(localStorage.getItem('tgtone_refresh_token')).toBeNull();
  });
});

describe('Aviso de sesión no recuperable', () => {
  const mockConfig = {
    coreApiUrl: 'http://localhost:3001',
    appDomain: 'localhost:3000',
    debug: false,
  };

  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    jest.clearAllTimers();
    localStorage.setItem('tgtone_auth_token', 'some-token');
    localStorage.setItem('tgtone_refresh_token', 'old-refresh');
  });

  it('avisa al llamador cuando el refresh no es recuperable', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => nestedError('INVALID_REFRESH_TOKEN'),
    });

    const onSessionUnrecoverable = jest.fn();
    const client = new TGTAuthClient({ ...mockConfig, onSessionUnrecoverable });

    const result = await client.refreshAccessToken();

    expect(result).toBe(false);
    expect(onSessionUnrecoverable).toHaveBeenCalledTimes(1);
    expect(onSessionUnrecoverable.mock.calls[0][0]).toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
    expect(localStorage.getItem('tgtone_refresh_token')).toBeNull();
  });

  it('no avisa cuando el fallo es transitorio', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ message: 'Service Unavailable' }),
    });

    const onSessionUnrecoverable = jest.fn();
    const client = new TGTAuthClient({ ...mockConfig, onSessionUnrecoverable });

    await client.refreshAccessToken();

    expect(onSessionUnrecoverable).not.toHaveBeenCalled();
  });

  it('no avisa si un intento posterior renueva el token', async () => {
    const newToken = createMockJWT({ sub: 'user-uuid', exp: Math.floor(Date.now() / 1000) + 3600 });

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({ message: 'Bad Gateway' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ accessToken: newToken }) });

    const onSessionUnrecoverable = jest.fn();
    const client = new TGTAuthClient({ ...mockConfig, onSessionUnrecoverable });

    await client.refreshAccessToken();
    const second = await client.refreshAccessToken();

    expect(second).toBe(true);
    expect(onSessionUnrecoverable).not.toHaveBeenCalled();
  });

  it('no rompe si el llamador no configuró la señal', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => nestedError('INVALID_REFRESH_TOKEN'),
    });

    const client = new TGTAuthClient(mockConfig);
    const result = await client.refreshAccessToken();

    expect(result).toBe(false);
    expect(localStorage.getItem('tgtone_refresh_token')).toBeNull();
  });
});

describe('Interceptor con la forma anidada del core (compatibilidad de deploy)', () => {
  const mockAuthClient = {
    getToken: jest.fn().mockReturnValue('mock-token'),
    refreshAccessToken: jest.fn().mockResolvedValue(false),
    stopHeartbeat: jest.fn(),
    redirectToLogin: jest.fn(),
    getBlockedRedirectUrl: jest.fn((error: AuthError) => `/blocked?type=${error.code.toLowerCase()}`),
  } as unknown as TGTAuthClient;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reconoce la revocación anidada y lleva a la página de bloqueo', async () => {
    let capturedOnRejected: (error: unknown) => Promise<unknown>;

    const mockAxios = {
      interceptors: {
        response: {
          use: jest.fn((_onFulfilled, onRejected) => {
            capturedOnRejected = onRejected;
            return 1;
          }),
          eject: jest.fn(),
        },
      },
      request: jest.fn(),
    };

    createAxiosInterceptor(mockAxios, mockAuthClient);

    await expect(
      capturedOnRejected!({
        response: { status: 401, data: nestedError('ACCESS_REVOKED') },
        config: { url: '/api/v1/users' },
      })
    ).rejects.toBeDefined();

    expect(mockAuthClient.getBlockedRedirectUrl).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ACCESS_REVOKED', message: 'Texto humano' })
    );
  });

  it('handleAuthError reconoce la forma anidada y no explota con message objeto', () => {
    const onRevoked = jest.fn();

    const handled = handleAuthError(
      { response: { status: 401, data: nestedError('USER_INACTIVE') }, config: { url: '/x' } },
      mockAuthClient,
      { onRevoked }
    );

    expect(handled).toBe(true);
    expect(onRevoked).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'USER_INACTIVE', message: 'Texto humano' })
    );
  });

  it('no trata como revocación un 401 de negocio sin código de token', () => {
    const onRevoked = jest.fn();

    const handled = handleAuthError(
      { response: { status: 401, data: { message: 'PIN incorrecto' } }, config: { url: '/x' } },
      mockAuthClient,
      { onRevoked }
    );

    expect(handled).toBe(false);
    expect(onRevoked).not.toHaveBeenCalled();
  });
});
