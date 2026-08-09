import { TGTAuthClient } from '../tgtone-auth-client';
import type { TGTAuthConfig } from '../tgtone-auth-client';

// ── Mock globals ─────────────────────────────────────────────────
// El SDK lee `window` y `document.cookie` en el constructor (ensureDeviceId).
function createClient(config: Partial<TGTAuthConfig> = {}): TGTAuthClient {
  return new TGTAuthClient({
    coreApiUrl: 'http://localhost:3090',
    appDomain: 'console.tgtone.cl',
    appKey: 'console',
    ...config,
  } as TGTAuthConfig);
}

const DEVICE_KEY = 'tgtone_device_id';

describe('TGTAuthClient deviceId', () => {
  let originalDocumentCookie: string;
  let cookieValue: string;
  let localStorageSpy: any;

  beforeEach(() => {
    // Mock document.cookie como getter controlable
    originalDocumentCookie = '';
    cookieValue = '';
    Object.defineProperty(document, 'cookie', {
      get: () => cookieValue,
      set: (v: string) => { cookieValue = v; },
      configurable: true,
    });
    localStorage.clear();
    // El constructor llama localStorage.setItem/getItem — espiar para verificar.
    localStorageSpy = {
      setItem: jest.spyOn(localStorage, 'setItem'),
      getItem: jest.spyOn(localStorage, 'getItem'),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('⚠ localStorage existente — es usado como deviceId', () => {
    const id = localStorage.setItem(DEVICE_KEY, 'local-device-123');
    const client = createClient();
    expect(client.getDeviceId()).toBe('local-device-123');
  });

  test('⚠ cookie tgtone_device (del core) — se usa y se cachea en localStorage', () => {
    // El core setea tgtone_device en .tgtone.cl → visible via document.cookie
    cookieValue = 'tgtone_device=core-device-abc; Path=/; SameSite=None';
    const client = createClient();
    expect(client.getDeviceId()).toBe('core-device-abc');
    // Se cachea en localStorage
    expect(localStorage.getItem(DEVICE_KEY)).toBe('core-device-abc');
  });

  test('⚠ cookie tgtone_device tiene prioridad sobre localStorage', () => {
    localStorage.setItem(DEVICE_KEY, 'stale-local-device');
    cookieValue = 'tgtone_device=fresh-core-device; Path=/';
    const client = createClient();
    expect(client.getDeviceId()).toBe('fresh-core-device');
  });

  test('... sin cookie ni localStorage — genera UUID propio', () => {
    // No hacer nada: localStorage vacío, sin cookie
    const client = createClient();
    const id = client.getDeviceId();
    expect(id).toBeTruthy();
    // Debe haberse persistido en localStorage
    expect(localStorage.getItem(DEVICE_KEY)).toBe(id);
  });
});
