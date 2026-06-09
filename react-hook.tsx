/**
 * 🔐 React Hook para TGT One Auth
 * 
 * Hook de React para integrar SSO en apps React del ecosistema TGT One.
 * 
 * @example
 * ```tsx
 * // Uso básico
 * function App() {
 *   const { session, loading, logout, hasRole } = useTGTAuth({
 *     identityUrl: 'https://identity.tgtone.cl',
 *     appDomain: 'zenith.tgtone.cl',
 *     enableHeartbeat: true, // Habilitar validación periódica
 *   });
 * 
 *   if (loading) return <Spinner />;
 *   if (!session) return null; // Ya está redirigiendo al login
 * 
 *   return (
 *     <Dashboard user={session.user}>
 *       {hasRole('zenith', 'admin') && <AdminPanel />}
 *       <LogoutButton onClick={logout} />
 *     </Dashboard>
 *   );
 * }
 * ```
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { TGTAuthClient, TGTSession, TGTAuthConfig, AuthError } from './tgtone-auth-client';
import type { UserPermissions } from './tgtone-auth-client';

export interface UseTGTAuthConfig extends TGTAuthConfig {
  /**
   * Si es true, inicia el monitor de sesión automáticamente después del login.
   * Por defecto true.
   */
  enableSessionMonitor?: boolean;
  
  /** @deprecated Usar `enableSessionMonitor` en su lugar. */
  enableHeartbeat?: boolean;
  
  /**
   * Si es true, muestra un estado de sesión revocada en lugar de redirigir.
   * Útil para Landing u apps que quieren manejar el UI internamente.
   * Por defecto false.
   */
  showRevokedState?: boolean;
}

export interface UseTGTAuthResult {
  /** Sesión autenticada o null si no hay sesión */
  session: TGTSession | null;
  
  /** true mientras se verifica la sesión */
  loading: boolean;
  
  /** Función para cerrar sesión */
  logout: () => Promise<void>;
  
  /** Verifica si el usuario tiene un rol específico */
  hasRole: (appName: string, roleName: string) => boolean;
  
  /** Obtiene todos los roles en una app */
  getRoles: (appName: string) => string[];
  
  /** Verifica acceso a una app */
  hasAccessToApp: (appName: string) => boolean;
  
  /** Redirige a la página de bloqueo cuando no hay acceso a una app */
  redirectToAppBlocked: (appName?: string) => void;
  
  /** Obtiene permisos granulares filtrados por plan (async, con caché) */
  getPermissions: (forceRefresh?: boolean) => Promise<UserPermissions | null>;
  
  /** Verifica un permiso específico en un módulo */
  hasModulePermission: (module: string, action: string, appKey?: string) => Promise<boolean>;
  
  /** Obtiene los módulos activos del plan */
  getPlanModules: (appKey?: string) => Promise<string[] | null>;
  
  /** Limpia el caché de permisos */
  clearPermissionsCache: () => void;
  
  /** ID del tenant actual */
  tenantId: string | null;
  
  /** Obtiene el token JWT actual */
  getToken: () => string | null;
  
  /** Cliente de autenticación (para operaciones avanzadas) */
  authClient: TGTAuthClient;
  
  /** Error de sesión revocada (solo si showRevokedState es true) */
  revokedError: AuthError | null;
  
  /** true si el monitor de sesión está activo */
  isSessionMonitorActive: boolean;
  
  /** @deprecated Usar `isSessionMonitorActive` en su lugar. */
  isHeartbeatActive: boolean;
  
  /** Se incrementa cuando el monitor invalida permisos */
  permissionsVersion: number;
  
  /** Inicia el monitor de sesión manualmente */
  startSessionMonitor: () => void;
  
  /** Detiene el monitor de sesión manualmente */
  stopSessionMonitor: () => void;
  
  /** @deprecated Usar `startSessionMonitor` en su lugar. */
  startHeartbeat: () => void;
  
  /** @deprecated Usar `stopSessionMonitor` en su lugar. */
  stopHeartbeat: () => void;
}

/**
 * Hook de React para autenticación SSO con TGT One Identity.
 * 
 * @param config Configuración del cliente de autenticación
 * @returns Estado de autenticación y métodos útiles
 * 
 * @example
 * ```tsx
 * // Uso básico
 * function App() {
 *   const { session, loading, logout, hasRole, tenantId } = useTGTAuth({
 *     identityUrl: 'https://identity.tgtone.cl',
 *     appDomain: 'zenith.tgtone.cl',
 *     debug: true,
 *     enableHeartbeat: true, // Valida sesión cada 5 minutos
 *   });
 * 
 *   if (loading) {
 *     return <LoadingSpinner />;
 *   }
 * 
 *   if (!session) {
 *     // Ya está redirigiendo al login
 *     return null;
 *   }
 * 
 *   return (
 *     <Dashboard user={session.user} tenant={session.tenantName}>
 *       {hasRole('zenith', 'admin') && <AdminPanel />}
 *       <LogoutButton onClick={logout} />
 *     </Dashboard>
 *   );
 * }
 * ```
 * 
 * @example
 * ```tsx
 * // Con manejo de sesión revocada personalizado (Landing)
 * function LandingApp() {
 *   const { session, loading, revokedError } = useTGTAuth({
 *     identityUrl: 'https://identity.tgtone.cl',
 *     appDomain: 'tgtone.cl',
 *     showRevokedState: true, // No redirigir, mostrar estado
 *   });
 * 
 *   if (loading) return <Spinner />;
 *   
 *   if (revokedError) {
 *     return (
 *       <RevokedSessionPage 
 *         error={revokedError} 
 *         onContactSupport={() => window.open('mailto:soporte@tgtone.cl')}
 *       />
 *     );
 *   }
 * 
 *   if (!session) return null;
 * 
 *   return <LandingContent user={session.user} />;
 * }
 * ```
 */
export function useTGTAuth(config: UseTGTAuthConfig): UseTGTAuthResult {
  const [session, setSession] = useState<TGTSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [revokedError, setRevokedError] = useState<AuthError | null>(null);
  const [isSessionMonitorActive, setIsSessionMonitorActive] = useState(false);
  const [permissionsVersion, setPermissionsVersion] = useState(0);
  
  const clientRef = useRef<TGTAuthClient | null>(null);
  const shouldEnableMonitorRef = useRef<boolean>(true);
  
  if (!clientRef.current) {
    const { enableSessionMonitor, enableHeartbeat, showRevokedState = false, ...authConfig } = config;
    shouldEnableMonitorRef.current = enableSessionMonitor ?? enableHeartbeat ?? true;
    
    const finalConfig: TGTAuthConfig = {
      ...authConfig,
      onSessionRevoked: showRevokedState 
        ? (error: AuthError) => {
            setRevokedError(error);
            setSession(null);
          }
        : authConfig.onSessionRevoked,
      onPermissionsStale: () => {
        setPermissionsVersion(v => v + 1);
      },
    };
    
    clientRef.current = new TGTAuthClient(finalConfig);
  }
  
  const authClient = clientRef.current;

  useEffect(() => {
    async function validateSession() {
      try {
        const authenticatedSession = await authClient.checkSession();
        setSession(authenticatedSession);
        
        if (authenticatedSession && shouldEnableMonitorRef.current) {
          authClient.startSessionMonitor();
          setIsSessionMonitorActive(true);
        }
      } catch (error) {
        console.error('[useTGTAuth] Error validando sesión:', error);
        setSession(null);
      } finally {
        if (!authClient.isRedirecting()) {
          setLoading(false);
        }
      }
    }

    validateSession();
    
    return () => {
      authClient.stopSessionMonitor();
    };
  }, [authClient]);

  const logout = useCallback(async () => {
    authClient.stopSessionMonitor();
    setIsSessionMonitorActive(false);
    await authClient.logout();
    setSession(null);
    setRevokedError(null);
  }, [authClient]);

  const startSessionMonitor = useCallback(() => {
    authClient.startSessionMonitor();
    setIsSessionMonitorActive(authClient.isSessionMonitorActive());
  }, [authClient]);

  const stopSessionMonitor = useCallback(() => {
    authClient.stopSessionMonitor();
    setIsSessionMonitorActive(false);
  }, [authClient]);

  const startHeartbeat = useCallback(() => {
    startSessionMonitor();
  }, [startSessionMonitor]);

  const stopHeartbeat = useCallback(() => {
    stopSessionMonitor();
  }, [stopSessionMonitor]);

  return {
    session,
    loading,
    logout,
    hasRole: authClient.hasRole.bind(authClient),
    getRoles: authClient.getRoles.bind(authClient),
    hasAccessToApp: authClient.hasAccessToApp.bind(authClient),
    redirectToAppBlocked: authClient.redirectToAppBlocked.bind(authClient),
    getPermissions: authClient.getPermissions.bind(authClient),
    hasModulePermission: authClient.hasModulePermission.bind(authClient),
    getPlanModules: authClient.getPlanModules.bind(authClient),
    clearPermissionsCache: authClient.clearPermissionsCache.bind(authClient),
    tenantId: authClient.getTenantId(),
    getToken: () => authClient.getToken(),
    authClient,
    revokedError,
    isSessionMonitorActive,
    isHeartbeatActive: isSessionMonitorActive,
    startSessionMonitor,
    stopSessionMonitor,
    startHeartbeat,
    stopHeartbeat,
    permissionsVersion,
  };
}

export default useTGTAuth;