import { TGTAuthClient } from '../tgtone-auth-client';

// ── Mock WebSocket global que captura onmessage ─────────────────────
type MSG = { type: string; payload?: any };
let lastOnMessage: ((ev: { data: string }) => void) | null = null;
let lastOnOpen: (() => void) | null = null;

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 1;
  sent: string[] = [];
  url: string;
  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    // Capturar el handler global para el último instance
    lastOnMessage = (ev) => this.onmessage?.(ev);
    lastOnOpen = () => this.onopen?.();
  }
  send(data: string) { this.sent.push(data); }
  close() { this.onclose?.(); }
}

(global as any).WebSocket = MockWebSocket;

function createMockJWT(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.mock-sig`;
}

// Helper: setear token + currentUser, iniciar monitor, simular auth del WS
function setupAuthenticatedClient(userId: string): { client: TGTAuthClient; simulate: (msg: MSG) => void } {
  const client = new TGTAuthClient({
    coreApiUrl: 'http://localhost:3001',
    appDomain: 'console.tgtone.cl',
    appKey: 'console',
    sessionCacheUrl: 'https://session.tgtone.cl',
    heartbeatIntervalMs: 60000,
    debug: false,
  } as any);
  // Token con sub = userId
  localStorage.setItem('tgtone_auth_token', createMockJWT({ sub: userId }));
  // currentUser se setea al decodificar en checkSession... para test lo forzamos
  (client as any).currentUser = { sub: userId };
  (client as any).currentSession = {};
  client.startSessionMonitor();
  const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
  // Simular WS open + auth
  ws.onopen?.();
  return {
    client,
    simulate: (msg: MSG) => ws.onmessage?.({ data: JSON.stringify(msg) }) as any,
  };
}

jest.useFakeTimers();

describe('auth-sdk: procesamiento WS de revocación (formatos de realtime)', () => {
  let redirectSpy: jest.SpyInstance;
  let handleRevokedSpy: jest.SpyInstance;

  beforeEach(() => {
    (global as any).WebSocket = MockWebSocket;
    MockWebSocket.instances = [];
    localStorage.clear();
    jest.clearAllMocks();
    jest.clearAllTimers();
    redirectSpy = jest.spyOn(TGTAuthClient.prototype as any, 'redirectToLogin').mockImplementation(() => {});
    handleRevokedSpy = jest.spyOn(TGTAuthClient.prototype as any, 'handleSessionRevoked').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('SESSION_REVOKED (UPPER_SNAKE de realtime) desloguea y redirige al login', () => {
    const { client, simulate } = setupAuthenticatedClient('user-abc');
    // Emitir el formato exacto que realtime envía
    simulate({ type: 'SESSION_REVOKED', payload: { userId: 'user-abc', reason: 'logout' } });
    expect(redirectSpy).toHaveBeenCalled();
    expect(localStorage.getItem('tgtone_auth_token')).toBeNull();
  });

  test('ROLES_CHANGED (UPPER_SNAKE) refresca permisos y dispara callback', () => {
    const onPermissionsChanged = jest.fn();
    const client = new TGTAuthClient({
      coreApiUrl: 'http://localhost:3001', appDomain: 'console.tgtone.cl',
      appKey: 'console', sessionCacheUrl: 'https://session.tgtone.cl',
      heartbeatIntervalMs: 60000, debug: false,
      onPermissionsChanged,
    } as any);
    (client as any).currentUser = { sub: 'user-abc' };
    (client as any).currentSession = {};
    client.startSessionMonitor();
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    ws.onopen?.();
    ws.onmessage?.({ data: JSON.stringify({ type: 'ROLES_CHANGED', payload: { appKey: 'console', roles: ['admin'] } }) } as any);
    expect(onPermissionsChanged).toHaveBeenCalledWith('console', ['admin']);
  });

  test('ACCESS_REVOKED (UPPER_SNAKE) para la app actual muestra blocked page', () => {
    const showBlockedSpy = jest.spyOn(TGTAuthClient.prototype as any, 'showBlockedPage').mockImplementation(() => {});
    const { simulate } = setupAuthenticatedClient('user-abc');
    simulate({ type: 'ACCESS_REVOKED', payload: { appKey: 'console', reason: 'PERMISSION_REMOVED' } });
    expect(showBlockedSpy).toHaveBeenCalled();
  });

  test('SESSION_REVOKED_BULK desloguea si tenant coincide', () => {
    const client = new TGTAuthClient({
      coreApiUrl: 'http://localhost:3001', appDomain: 'console.tgtone.cl',
      appKey: 'console', sessionCacheUrl: 'https://session.tgtone.cl',
      heartbeatIntervalMs: 60000, debug: false,
    } as any);
    (client as any).currentUser = { sub: 'user-abc' };
    // getTenantId depende de currentSession.tenantId — setear
    (client as any).currentSession = { tenantId: 'tenant-1' };
    client.startSessionMonitor();
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    ws.onopen?.();
    ws.onmessage?.({ data: JSON.stringify({ type: 'SESSION_REVOKED_BULK', payload: { tenantId: 'tenant-1', reason: 'tenant_suspended' } }) } as any);
    expect(handleRevokedSpy).toHaveBeenCalled();
  });

  test('Retro-compat: session_terminated (snake_case legacy) sigue funcionando', () => {
    const { simulate } = setupAuthenticatedClient('user-abc');
    simulate({ type: 'session_terminated', payload: { userId: 'user-abc', reason: 'logout' } });
    expect(redirectSpy).toHaveBeenCalled();
  });
});
