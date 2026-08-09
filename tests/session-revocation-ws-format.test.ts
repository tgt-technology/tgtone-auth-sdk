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
function setupAuthenticatedClient(userId: string, sid: string | null = null): { client: TGTAuthClient; simulate: (msg: MSG) => void } {
  const client = new TGTAuthClient({
    coreApiUrl: 'http://localhost:3001',
    appDomain: 'console.tgtone.cl',
    appKey: 'console',
    sessionCacheUrl: 'https://session.tgtone.cl',
    heartbeatIntervalMs: 60000,
    debug: false,
  } as any);
  // Token con sub = userId + sid (si se pasa)
  localStorage.setItem('tgtone_auth_token', createMockJWT({ sub: userId, ...(sid ? { sid } : {}) }));
  // currentUser se setea al decodificar en checkSession... para test lo forzamos
  (client as any).currentUser = { sub: userId, sid };
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

  test('SESSION_REVOKED dirigido con sessionId COINCIDENTE desloguea', () => {
    const { simulate } = setupAuthenticatedClient('user-abc', 'session-EDGE');
    simulate({ type: 'SESSION_REVOKED', payload: { userId: 'user-abc', sessionId: 'session-EDGE', reason: 'logout' } });
    expect(redirectSpy).toHaveBeenCalled();
    expect(localStorage.getItem('tgtone_auth_token')).toBeNull();
  });

  test('SESSION_REVOKED dirigido con sessionId DIFERENTE (otro dispositivo) NO desloguea', () => {
    const { simulate } = setupAuthenticatedClient('user-abc', 'session-FFX');
    simulate({ type: 'SESSION_REVOKED', payload: { userId: 'user-abc', sessionId: 'session-EDGE', reason: 'logout' } });
    // Firefox NO fue cerrado (su sid difiere del del evento Edge) → no redirige ni limpia
    expect(redirectSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem('tgtone_auth_token')).not.toBeNull();
  });

  test('SESSION_REVOKED global (sin sessionId) desloguea aunque haya sid', () => {
    const { simulate } = setupAuthenticatedClient('user-abc', 'session-FFX');
    simulate({ type: 'SESSION_REVOKED', payload: { userId: 'user-abc', reason: 'logout' } });
    expect(redirectSpy).toHaveBeenCalled();
  });

  test('CASO BUG nexo: currentUser sin sid pero token con sid distinto → NO desloguea por revoke a otra sesión', () => {
    // Simula nexo donde currentUser.sid quedó null (no poblado) pero el token guardado
    // tiene sid = session-FFX (la sesión real). Llega revoke dirigido a session-EDGE (otra).
    const client = new TGTAuthClient({
      coreApiUrl: 'http://localhost:3001', appDomain: 'console.tgtone.cl',
      appKey: 'console', sessionCacheUrl: 'https://session.tgtone.cl', heartbeatIntervalMs: 60000, debug: false,
    } as any);
    // Token guardado tiene sid (sesión real), currentUser.sid null (no poblado)
    localStorage.setItem('tgtone_auth_token', createMockJWT({ sub: 'user-abc', sid: 'session-FFX' }));
    (client as any).currentUser = { sub: 'user-abc', sid: null }; // ← el caso del bug (currentUser sin sid)
    (client as any).currentSession = {};
    client.startSessionMonitor();
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    ws.onopen?.();
    ws.onmessage?.({ data: JSON.stringify({ type: 'SESSION_REVOKED', payload: { userId: 'user-abc', sessionId: 'session-EDGE', reason: 'logout' } }) } as any);
    // Debe IGNORAR (session-EDGE ≠ sid derivado del token session-FFX) → no desloguea
    expect(redirectSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem('tgtone_auth_token')).not.toBeNull();
  });

  test('CASO BUG nexo: currentUser sin sid y token con sid COINCIDENTE → SÍ desloguea (es su sesión)', () => {
    const client = new TGTAuthClient({
      coreApiUrl: 'http://localhost:3001', appDomain: 'console.tgtone.cl',
      appKey: 'console', sessionCacheUrl: 'https://session.tgtone.cl', heartbeatIntervalMs: 60000, debug: false,
    } as any);
    localStorage.setItem('tgtone_auth_token', createMockJWT({ sub: 'user-abc', sid: 'session-FFX' }));
    (client as any).currentUser = { sub: 'user-abc', sid: null };
    (client as any).currentSession = {};
    client.startSessionMonitor();
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    ws.onopen?.();
    ws.onmessage?.({ data: JSON.stringify({ type: 'SESSION_REVOKED', payload: { userId: 'user-abc', sessionId: 'session-FFX', reason: 'logout' } }) } as any);
    // Reproduce el fix: deriva sid del token (session-FFX) que COINCIDE → desloguea
    expect(redirectSpy).toHaveBeenCalled();
    expect(localStorage.getItem('tgtone_auth_token')).toBeNull();
  });
});
