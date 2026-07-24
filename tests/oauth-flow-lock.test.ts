/**
 * Tests del lock de flujo OAuth multi-pestaña (D3)
 *
 * Simula dos instancias de TGTAuthClient (dos "pestañas") compartiendo
 * el mismo localStorage de jsdom.
 */
import { TGTAuthClient } from '../tgtone-auth-client';

const FLOW_LOCK_KEY = 'tgtone_oauth_flow_lock';

jest.mock('../pkce', () => ({
  generatePKCE: jest.fn(async () => ({
    codeVerifier: 'test-verifier',
    codeChallenge: 'test-challenge',
  })),
}));

function makeClient(onAuthSuccess?: (s: any) => void): TGTAuthClient {
  return new TGTAuthClient({
    coreApiUrl: 'http://localhost:3001',
    appDomain: 'localhost',
    appKey: 'console',
    debug: false,
    ...(onAuthSuccess ? { onAuthSuccess } : {}),
  });
}

function makeToken(): string {
  const payload = {
    sub: 'u1', email: 'a@b.cl', tenantId: 't1', tenantName: 'T',
    roles: { console: ['owner'] },
    exp: Math.floor(Date.now() / 1000) + 900,
  };
  return `h.${btoa(JSON.stringify(payload))}.s`;
}

describe('OAuth flow lock (multi-tab)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    jest.restoreAllMocks();
    window.history.replaceState({}, '', '/');
  });

  describe('_readFlowLock / _acquireFlowLock / _releaseFlowLock', () => {
    it('adquiere el lock cuando está libre', () => {
      const client = makeClient() as any;
      expect(client._acquireFlowLock()).toBe(true);
      const lock = client._readFlowLock();
      expect(lock).not.toBeNull();
      expect(lock.tabId).toBe(client._tabId);
    });

    it('libera el lock solo si pertenece a esta pestaña', () => {
      const owner = makeClient() as any;
      const other = makeClient() as any;

      owner._acquireFlowLock();
      other._releaseFlowLock(); // no debe liberar lock ajeno
      expect(owner._readFlowLock()).not.toBeNull();

      owner._releaseFlowLock();
      expect(owner._readFlowLock()).toBeNull();
    });

    it('lock expirado (>30s) se considera inexistente', () => {
      const client = makeClient() as any;
      localStorage.setItem(FLOW_LOCK_KEY, JSON.stringify({
        tabId: 'otra-tab',
        timestamp: Date.now() - 31_000,
      }));
      expect(client._readFlowLock()).toBeNull();
    });
  });

  describe('authorize()', () => {
    it('pestaña libre adquiere lock y redirige', async () => {
      const client = makeClient() as any;
      const acquireSpy = jest.spyOn(client, '_acquireFlowLock');
      await client.authorize();
      expect(acquireSpy).toHaveBeenCalled();
      expect(client._readFlowLock()?.tabId).toBe(client._tabId);
    });

    it('con lock vigente de otra pestaña y token disponible → adopta sesión sin redirigir', async () => {
      const owner = makeClient() as any;
      owner._acquireFlowLock();

      localStorage.setItem('tgtone_auth_token', makeToken());

      const onSuccess = jest.fn();
      const other = makeClient(onSuccess) as any;
      const acquireSpy = jest.spyOn(other, '_acquireFlowLock');

      await other.authorize();

      expect(acquireSpy).not.toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalled();
    });

    it('con lock vigente de otra pestaña que no completa → retoma el flujo', async () => {
      const owner = makeClient() as any;
      owner._acquireFlowLock();

      const other = makeClient() as any;
      jest.spyOn(other, '_waitForFlowCompletion').mockResolvedValue(false);
      const acquireSpy = jest.spyOn(other, '_acquireFlowLock');

      await other.authorize();
      expect(acquireSpy).toHaveBeenCalled();
    });
  });

  describe('callback en pestaña ajena', () => {
    it('sin code_verifier y con lock ajeno → NO ejecuta exchange, limpia la URL', async () => {
      const owner = makeClient() as any;
      owner._acquireFlowLock();

      window.history.replaceState({}, '', '/?code=abc123');

      const other = makeClient() as any;
      // Acortar la espera para el test (en prod: 15s)
      (other.constructor as any).FLOW_WAIT_TIMEOUT_MS = 300;
      const callbackSpy = jest.spyOn(other, 'handleCallback');
      const session = await other.checkSession();

      expect(callbackSpy).not.toHaveBeenCalled();
      expect(window.location.search).not.toContain('code=');
      expect(session).toBeNull();
    }, 10000);

    it('con code_verifier propio → ejecuta el exchange aunque exista lock', async () => {
      const client = makeClient() as any;
      sessionStorage.setItem('oauth_code_verifier', 'verifier-propio');
      window.history.replaceState({}, '', '/?code=abc123');

      const handleSpy = jest.spyOn(client, 'handleCallback').mockResolvedValue({} as any);
      jest.spyOn(client, 'getStoredToken').mockReturnValue(null);

      await client.checkSession();
      expect(handleSpy).toHaveBeenCalled();
    });
  });

  describe('liberación del lock en handleCallback', () => {
    it('handleCallback exitoso libera el lock', async () => {
      const client = makeClient() as any;
      client._acquireFlowLock();
      sessionStorage.setItem('oauth_code_verifier', 'v');
      window.history.replaceState({}, '', '/?code=abc');

      (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: makeToken(),
          refresh_token: 'rt',
        }),
      });

      await client.handleCallback();
      expect(client._readFlowLock()).toBeNull();
    });
  });
});
