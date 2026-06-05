/**
 * Tests para la lógica de config del React hook useTGTAuth
 * 
 * El hook es un thin wrapper — toda la lógica de autenticación
 * está testada en auth-client.test.ts. Estos tests verifican
 * que la config que se pasa a TGTAuthClient se construye correctamente:
 * - enableSessionMonitor / enableHeartbeat se manejan
 * - showRevokedState configura onSessionRevoked
 * - onPermissionsStale siempre se agrega
 */

import type { TGTAuthConfig, AuthError } from '../tgtone-auth-client';

// ---------------------------------------------------------------------------
// Extraemos la lógica de construcción de config (igual que el hook)
// ---------------------------------------------------------------------------

interface HookConfig extends TGTAuthConfig {
  enableSessionMonitor?: boolean;
  enableHeartbeat?: boolean;
  showRevokedState?: boolean;
}

/**
 * Replica la lógica del hook para construir la config final.
 * Esto permite testear sin renderizar React.
 */
function buildHookConfig(
  config: HookConfig,
  callbacks: {
    setRevokedError: (error: AuthError | null) => void;
    setSession: (session: unknown) => void;
    setPermissionsVersion: (fn: (v: number) => number) => void;
  }
): { config: TGTAuthConfig; shouldEnableMonitor: boolean } {
  const { enableSessionMonitor, enableHeartbeat, showRevokedState = false, ...authConfig } = config;
  const shouldEnableMonitor = enableSessionMonitor ?? enableHeartbeat ?? true;

  const finalConfig: TGTAuthConfig = {
    ...authConfig,
    onSessionRevoked: showRevokedState
      ? (error: AuthError) => {
          callbacks.setRevokedError(error);
          callbacks.setSession(null);
        }
      : authConfig.onSessionRevoked,
    onPermissionsStale: () => {
      callbacks.setPermissionsVersion(v => v + 1);
    },
  };

  return { config: finalConfig, shouldEnableMonitor };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildHookConfig (lógica del hook)', () => {
  const baseCallbacks = {
    setRevokedError: jest.fn(),
    setSession: jest.fn(),
    setPermissionsVersion: jest.fn((fn: (v: number) => number) => fn(0)),
  };

  const baseConfig: HookConfig = {
    identityUrl: 'https://identity.test.tgtone.cl',
    appDomain: 'test.tgtone.cl',
    onAuthSuccess: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('config base', () => {
    it('debe preservar identityUrl y appDomain', () => {
      const { config } = buildHookConfig(baseConfig, baseCallbacks);
      expect(config.identityUrl).toBe('https://identity.test.tgtone.cl');
      expect(config.appDomain).toBe('test.tgtone.cl');
    });

    it('debe preservar onAuthSuccess', () => {
      const { config } = buildHookConfig(baseConfig, baseCallbacks);
      expect(config.onAuthSuccess).toBe(baseConfig.onAuthSuccess);
    });

    it('NO debe incluir enableSessionMonitor en el config final', () => {
      const { config } = buildHookConfig(
        { ...baseConfig, enableSessionMonitor: false },
        baseCallbacks,
      );
      expect((config as any).enableSessionMonitor).toBeUndefined();
      expect((config as any).enableHeartbeat).toBeUndefined();
      expect((config as any).showRevokedState).toBeUndefined();
    });
  });

  describe('shouldEnableMonitor', () => {
    it('default debe ser true', () => {
      const { shouldEnableMonitor } = buildHookConfig(baseConfig, baseCallbacks);
      expect(shouldEnableMonitor).toBe(true);
    });

    it('enableSessionMonitor=false debe ser false', () => {
      const { shouldEnableMonitor } = buildHookConfig(
        { ...baseConfig, enableSessionMonitor: false },
        baseCallbacks,
      );
      expect(shouldEnableMonitor).toBe(false);
    });

    it('enableHeartbeat=false (deprecated) debe ser false', () => {
      const { shouldEnableMonitor } = buildHookConfig(
        { ...baseConfig, enableHeartbeat: false },
        baseCallbacks,
      );
      expect(shouldEnableMonitor).toBe(false);
    });

    it('enableSessionMonitor tiene prioridad sobre enableHeartbeat', () => {
      const { shouldEnableMonitor } = buildHookConfig(
        { ...baseConfig, enableSessionMonitor: true, enableHeartbeat: false },
        baseCallbacks,
      );
      expect(shouldEnableMonitor).toBe(true);
    });
  });

  describe('onPermissionsStale', () => {
    it('siempre debe estar definido', () => {
      const { config } = buildHookConfig(baseConfig, baseCallbacks);
      expect(config.onPermissionsStale).toBeDefined();
      expect(typeof config.onPermissionsStale).toBe('function');
    });

    it('debe llamar setPermissionsVersion con incrementador', () => {
      const { config } = buildHookConfig(baseConfig, baseCallbacks);
      config.onPermissionsStale!();
      expect(baseCallbacks.setPermissionsVersion).toHaveBeenCalledWith(expect.any(Function));
      // Verificar que el incrementador funciona
      const incrementFn = baseCallbacks.setPermissionsVersion.mock.calls[0][0] as (v: number) => number;
      expect(incrementFn(5)).toBe(6);
    });
  });

  describe('onSessionRevoked con showRevokedState', () => {
    it('showRevokedState=true debe crear un callback personalizado', () => {
      const { config } = buildHookConfig(
        { ...baseConfig, showRevokedState: true },
        baseCallbacks,
      );
      expect(config.onSessionRevoked).toBeDefined();
      expect(config.onSessionRevoked).not.toBe(baseConfig.onSessionRevoked);
    });

    it('el callback debe llamar setRevokedError y setSession(null)', () => {
      const { config } = buildHookConfig(
        { ...baseConfig, showRevokedState: true },
        baseCallbacks,
      );
      const testError: AuthError = {
        code: 'TENANT_INACTIVE',
        message: 'Tenant desactivado',
      };
      config.onSessionRevoked!(testError);
      expect(baseCallbacks.setRevokedError).toHaveBeenCalledWith(testError);
      expect(baseCallbacks.setSession).toHaveBeenCalledWith(null);
    });

    it('showRevokedState=false (default) debe preservar onSessionRevoked original', () => {
      const customRevoked = jest.fn();
      const { config } = buildHookConfig(
        { ...baseConfig, onSessionRevoked: customRevoked },
        baseCallbacks,
      );
      expect(config.onSessionRevoked).toBe(customRevoked);
    });

    it('sin showRevokedState ni onSessionRevoked debe ser undefined', () => {
      const { config } = buildHookConfig(baseConfig, baseCallbacks);
      expect(config.onSessionRevoked).toBeUndefined();
    });

    it('showRevokedState=true tiene prioridad sobre onSessionRevoked custom', () => {
      const customRevoked = jest.fn();
      const { config } = buildHookConfig(
        { ...baseConfig, showRevokedState: true, onSessionRevoked: customRevoked },
        baseCallbacks,
      );
      // showRevokedState=true reemplaza el callback
      expect(config.onSessionRevoked).not.toBe(customRevoked);
      expect(config.onSessionRevoked).toBeDefined();
    });
  });
});
