/**
 * Tests del circuit breaker de ciclos de auth (D4)
 */
import { TGTAuthClient } from '../tgtone-auth-client';

const CYCLE_COUNT_KEY = 'tgtone_auth_cycle_count';
const CYCLE_START_KEY = 'tgtone_auth_cycle_start';

jest.mock('../pkce', () => ({
  generatePKCE: jest.fn(async () => ({
    codeVerifier: 'test-verifier',
    codeChallenge: 'test-challenge',
  })),
}));

function makeClient(onAuthFailure?: (e: any) => void): TGTAuthClient {
  return new TGTAuthClient({
    coreApiUrl: 'http://localhost:3001',
    appDomain: 'localhost',
    appKey: 'console',
    debug: false,
    ...(onAuthFailure ? { onAuthFailure } : {}),
  });
}

describe('Auth cycle circuit breaker', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    jest.restoreAllMocks();
    window.history.replaceState({}, '', '/');
  });

  it('primer y segundo ciclo pasan normalmente', async () => {
    const onFailure = jest.fn();
    const client = makeClient(onFailure);

    await client.authorize();
    await client.authorize();

    expect(onFailure).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(CYCLE_COUNT_KEY)).toBe('2');
  });

  it('tercer ciclo dentro de 60s detiene y dispara onAuthFailure con AUTH_LOOP_DETECTED', async () => {
    const onFailure = jest.fn();
    const client = makeClient(onFailure);

    await client.authorize(); // 1
    await client.authorize(); // 2
    await client.authorize(); // 3 → freno

    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({
      code: 'AUTH_LOOP_DETECTED',
    }));
    expect(client.isRedirecting()).toBe(false);
  });

  it('onAuthSuccess resetea el contador', async () => {
    const onFailure = jest.fn();
    const client = makeClient(onFailure);

    await client.authorize(); // 1
    await client.authorize(); // 2

    // Simular login completado
    (client as any).config.onAuthSuccess({} as any);

    expect(sessionStorage.getItem(CYCLE_COUNT_KEY)).toBeNull();

    // Los siguientes ciclos parten de 1
    await client.authorize();
    expect(sessionStorage.getItem(CYCLE_COUNT_KEY)).toBe('1');
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('ventana de 60s expirada resetea el contador', async () => {
    const onFailure = jest.fn();
    const client = makeClient(onFailure);

    // Simular 2 ciclos hace 61s
    sessionStorage.setItem(CYCLE_START_KEY, String(Date.now() - 61_000));
    sessionStorage.setItem(CYCLE_COUNT_KEY, '2');

    await client.authorize();

    expect(sessionStorage.getItem(CYCLE_COUNT_KEY)).toBe('1');
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('el contador vive en sessionStorage (aislado por pestaña)', async () => {
    const client = makeClient();
    await client.authorize();

    expect(sessionStorage.getItem(CYCLE_COUNT_KEY)).toBe('1');
    expect(localStorage.getItem(CYCLE_COUNT_KEY)).toBeNull();
  });

  it('al frenar, libera el flow lock para no bloquear otras pestañas', async () => {
    const onFailure = jest.fn();
    const client = makeClient(onFailure) as any;

    await client.authorize();
    await client.authorize();
    await client.authorize(); // freno

    expect(client._readFlowLock()).toBeNull();
  });
});
