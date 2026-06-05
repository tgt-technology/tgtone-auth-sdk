/**
 * 🔐 TGT One Auth Client SDK
 * 
 * SDK estándar para integrar SSO en todas las aplicaciones del ecosistema TGT One.
 * 
 * @example
 * ```typescript
 * import { TGTAuthClient } from 'tgtone-auth-client';
 * 
 * const auth = new TGTAuthClient({
 *   identityUrl: 'https://identity.tgtone.cl',
 *   appDomain: 'zenith.tgtone.cl'
 * });
 * 
 * // En el inicio de tu app
 * const session = await auth.checkSession();
 * if (session) {
 *   console.log('Tenant:', session.tenantId);
 *   console.log('Roles:', session.roles);
 * }
 * ```
 */

import { jwtDecode } from 'jwt-decode';

// ============================================================================
// TIPOS
// ============================================================================

export interface JWTPayload {
  iss: string;
  aud: string;
  sub: string;
  jti: string;
  email: string;
  emailVerified: boolean;
  name: string;
  tenantId: string;
  tenantName: string;
  roles: Record<string, string[]>;
  iat: number;
  exp: number;
}

export interface TGTUser {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  tenantId: string;
  tenantName: string;
  roles: Record<string, string[]>;
}

export interface TGTSession {
  user: TGTUser;
  tenantId: string;
  tenantName: string;
  expiresAt: Date;
}

export interface TGTAuthConfig {
  /**
   * URL del Identity Provider (sin trailing slash)
   * @example 'https://identity.tgtone.cl'
   */
  identityUrl: string;
  
  /**
   * Dominio de la aplicación actual (sin protocolo)
   * @example 'zenith.tgtone.cl'
   */
  appDomain: string;
  
  /**
   * Key de la aplicación para validar suscripciones.
   * Si se proporciona, se usa en vez de extraerlo del dominio.
   * Útil para ambientes dev (ej: dev-baco.tgtone.cl donde el key es 'baco').
   * @optional
   * @example 'baco'
   */
  appKey?: string;
  
  /**
   * Callback que se ejecuta cuando la sesión es válida
   * @optional
   */
  onAuthSuccess?: (session: TGTSession) => void;
  
  /**
   * Callback que se ejecuta cuando no hay sesión o hay un error de autenticación
   * @optional
   */
  onAuthFailure?: (error?: AuthError) => void;
  
  /**
   * Callback que se ejecuta cuando la sesión es revocada
   * (usuario eliminado, tenant suspendido, etc.)
   * 
   * Si no se proporciona, el comportamiento por defecto es:
   * - Redirigir a Identity /blocked?type=<codigo>
   * 
   * @optional
   */
  onSessionRevoked?: (error: AuthError) => void;

  /**
   * OAuth 2.0 PKCE: Client ID for this application (Application.key)
   * Required for OAuth PKCE flow.
   * @example 'baco'
   */
  clientId?: string;

  /**
   * OAuth 2.0 PKCE: Redirect URI — where the user returns after login
   * Must match one of the oauth_redirect_uris configured in the Application.
   * @example 'https://baco.lovable.dev/auth/callback'
   */
  redirectUri?: string;

  /**
   * Si es true, loguea eventos en consola
   * @default false
   */
  debug?: boolean;
  
  /**
   * Hosts permitidos para redirecciones después del login.
   * Por defecto se permite el host configurado en `appDomain`.
   * Ej: ['tgtone.cl', 'app.tgtone.cl']
   */
  allowedRedirectHosts?: string[];
  
  /**
   * Intervalo en milisegundos para validar la sesión (heartbeat).
   * Por defecto 5 minutos (300000ms).
   * Setear a 0 para deshabilitar.
   * @default 300000
   */
  heartbeatIntervalMs?: number;
  
  /**
   * Callback invocado cuando el heartbeat invalida el caché de permisos.
   * Útil para que la app recargue permisos sin necesidad de F5.
   */
  onPermissionsStale?: () => void;

  /**
   * URL del Session Cache (VPS Linode) para notificaciones de revocación instantánea.
   * Si se configura, el SDK conecta WebSocket y REST fallback.
   * Si no se configura, funciona con el heartbeat tradicional de 5 min.
   * @example 'http://<linode-ip>:8080'
   */
  sessionCacheUrl?: string;

  /**
   * Callback cuando cambian los permisos del usuario en una app.
   * Se activa por WebSocket cuando un admin modifica roles.
   */
  onPermissionsChanged?: (app: string, newRoles: string[]) => void;

  /**
   * Callback cuando se revoca el acceso a una app.
   * Si es la app activa, el SDK muestra showBlockedPage() automáticamente.
   */
  onAccessRevoked?: (app: string, reason: string) => void;

  /**
   * Si es true, el flujo OAuth PKCE abre un popup en vez de redirect directo.
   * Si la app está dentro de un iframe, el popup se fuerza automáticamente sin importar este valor.
   * @default false
   */
  popupAuthEnabled?: boolean;
}

export interface SessionResponse {
  user: TGTUser;
}

/**
 * Códigos de error de autenticación conocidos
 */
export type AuthErrorCode =
  | 'TENANT_INACTIVE'
  | 'USER_INACTIVE'
  | 'USER_NOT_FOUND'
  | 'SESSION_EXPIRED'
  | 'ACCESS_REVOKED'
  | 'APP_SUBSCRIPTION_LOCKED'
  | 'TRIAL_EXPIRED';

/**
 * Error de autenticación estructurado
 */
export interface AuthError {
  code: AuthErrorCode;
  message: string;
}

/**
 * Datos para crear una nueva cuenta
 */
export interface SignupData {
  email: string;
  password?: string; // Opcional - si no se provee, el backend genera una temporal
  firstName: string;
  lastName: string;
  tenantName: string;
}

/**
 * Datos para login
 */
export interface LoginData {
  email: string;
  password: string;
  targetApp?: string;
}

/**
 * Respuesta de autenticación (signup/login)
 */
export interface AuthResponse {
  token: string;
  accessToken: string;
  expiresIn: number;
  expiresAt?: number;
  user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
  mustChangePassword?: boolean;
  requiresMfa?: boolean;
  tempToken?: string;
  message?: string;
  refreshToken?: string;
}

export interface PermissionModules {
  [moduleKey: string]: {
    [action: string]: boolean;
  };
}

export interface PermissionsStructure {
  modules: PermissionModules;
}

export interface AppPermissionDetail {
  applicationKey: string;
  applicationName: string;
  roleKey: string;
  roleName: string;
  permissions: PermissionsStructure | null;
  level: number;
  planModules: string[] | null;
}

export interface UserPermissions {
  userId: string;
  tenantId: string;
  organizationalRole: string | null;
  applications: AppPermissionDetail[];
}

// ============================================================================
// CLIENTE SSO
// ============================================================================

type InternalAuthConfig = Omit<Required<TGTAuthConfig>, 'onSessionRevoked' | 'onAuthSuccess' | 'onAuthFailure' | 'onPermissionsStale' | 'onPermissionsChanged' | 'onAccessRevoked' | 'appKey' | 'clientId' | 'redirectUri' | 'sessionCacheUrl' | 'popupAuthEnabled'> & {
  onAuthSuccess: (session: TGTSession) => void;
  onAuthFailure?: (error?: AuthError) => void;
  onSessionRevoked?: (error: AuthError) => void;
  onPermissionsStale?: () => void;
  onPermissionsChanged?: (app: string, newRoles: string[]) => void;
  onAccessRevoked?: (app: string, reason: string) => void;
  appKey?: string;
  clientId?: string;
  redirectUri?: string;
  sessionCacheUrl?: string;
  popupAuthEnabled?: boolean;
};

export class TGTAuthClient {
  private static readonly TOKEN_KEY = 'tgtone_auth_token';
  private static readonly TEMP_TOKEN_KEY = 'tgtone_temp_token';
  private static readonly REFRESH_TOKEN_KEY = 'tgtone_refresh_token';
  
  private static readonly DEFAULT_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
  private static readonly REFRESH_BEFORE_EXPIRY_MS = 5 * 60 * 1000;
  
  private config: InternalAuthConfig;
  private currentUser: TGTUser | null = null;
  private currentSession: TGTSession | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private isHeartbeatRunning = false;
  private permissionsCache: UserPermissions | null = null;
  private permissionsCacheExpiry: number = 0;
  private static readonly PERMISSIONS_CACHE_TTL = 30 * 60 * 1000;
  private refreshPromise: Promise<boolean> | null = null;

  // ── Session Cache (WebSocket + REST fallback) ──
  private ws: WebSocket | null = null;
  private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionCheckTimer: ReturnType<typeof setInterval> | null = null;
  private directHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private _wakeInProgress = false;
  private static readonly SESSION_CHECK_INTERVAL_MS = 60 * 1000; // 1 min

  constructor(config: TGTAuthConfig) {
    this.config = {
      onAuthSuccess: () => {},
      debug: false,
      heartbeatIntervalMs: TGTAuthClient.DEFAULT_HEARTBEAT_INTERVAL_MS,
      ...config,
      allowedRedirectHosts: config.allowedRedirectHosts ?? [config.appDomain],
    };

    // Derive OAuth clientId from appKey if not explicitly provided
    if (!this.config.clientId && this.config.appKey) {
      this.config.clientId = this.config.appKey;
    }

    // Derive redirectUri from appDomain if not explicitly provided
    if (!this.config.redirectUri && typeof window !== 'undefined') {
      this.config.redirectUri = `${window.location.protocol}//${this.config.appDomain}`;
    }

    this.log('🔹 TGT Auth Client inicializado', {
      identityUrl: this.config.identityUrl,
      appDomain: this.config.appDomain,
      appKey: this.config.appKey,
      clientId: this.config.clientId,
      redirectUri: this.config.redirectUri,
      heartbeatIntervalMs: this.config.heartbeatIntervalMs,
    });
  }

  // ==========================================================================
  // MÉTODOS PÚBLICOS
  // ==========================================================================

  /**
   * Crea una nueva cuenta de usuario.
   * 
   * @param data Datos del usuario y tenant
   * @returns Respuesta con token y datos del usuario
   * 
   * @example
   * ```typescript
   * const result = await auth.signup({
   *   email: 'juan@empresa.cl',
   *   password: 'MiPassword123!',
   *   firstName: 'Juan',
   *   lastName: 'Pérez',
   *   tenantName: 'Mi Empresa'
   * });
   * 
   * if (result.mustChangePassword) {
   *   // Usuario debe cambiar contraseña temporal
   * }
   * ```
   */
  async signup(data: SignupData): Promise<AuthResponse> {
    try {
      this.log('🔹 Creando nueva cuenta...');

      const response = await fetch(this.getSignupUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Error en el servidor' }));
        throw new Error(error.message || `Error ${response.status}: ${response.statusText}`);
      }

      const result: AuthResponse = await response.json();
      
      if (!result.token && !result.accessToken) {
        throw new Error('Respuesta inválida del servidor: falta token');
      }

      // Guardar token en localStorage
      const token = result.accessToken || result.token;
      this.storeToken(token);
      if (result.refreshToken) {
        this.storeRefreshToken(result.refreshToken);
      }

      // Decodificar y crear sesión
      const session = this.buildSessionFromToken(token);

      this.log('✅ Cuenta creada exitosamente');
      this.config.onAuthSuccess(session);

      return result;

    } catch (error) {
      this.log('❌ Error en signup:', error);
      throw error;
    }
  }

  /**
   * Inicia sesión con email y contraseña.
   * 
   * @param data Credenciales del usuario
   * @returns Respuesta con token y datos del usuario, o indicador de MFA
   * 
   * @example
   * ```typescript
   * const result = await auth.login({
   *   email: 'juan@empresa.cl',
   *   password: 'MiPassword123!'
   * });
   * 
   * if (result.requiresMfa) {
   *   // Mostrar formulario de código MFA
   *   const session = await auth.verifyMfa(result.tempToken, '123456');
   * } else {
   *   // Login exitoso
   *   console.log('Usuario:', result.user.email);
   * }
   * ```
   */
  async login(data: LoginData): Promise<AuthResponse> {
    try {
      this.log('🔹 Iniciando sesión...');

      const targetApp = data.targetApp || this.getCurrentAppKey();

      const response = await fetch(this.getLoginApiUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          ...(targetApp ? { targetApp } : {}),
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Credenciales inválidas' }));
        throw new Error(error.message || 'Credenciales inválidas');
      }

      const result: AuthResponse = await response.json();

      // Si requiere MFA, guardar tempToken y retornar
      if (result.requiresMfa && result.tempToken) {
        this.log('🔹 MFA requerido');
        this.storeTempToken(result.tempToken);
        return result;
      }

      // Login normal sin MFA
      if (!result.token && !result.accessToken) {
        throw new Error('Respuesta inválida del servidor: falta token');
      }

      // Guardar token en localStorage
      const token = result.accessToken || result.token;
      this.storeToken(token);
      if (result.refreshToken) {
        this.storeRefreshToken(result.refreshToken);
      }

      // Decodificar y crear sesión
      const session = this.buildSessionFromToken(token);

      this.log('✅ Login exitoso');
      this.config.onAuthSuccess(session);

      return result;

    } catch (error) {
      this.log('❌ Error en login:', error);
      throw error;
    }
  }

  /**
   * Verifica si existe una sesión válida.
   * Si no existe, redirige automáticamente al login.
   * 
   * Esta función:
   * 1. Intenta leer token de URL (si viene de redirect)
   * 2. Verifica localStorage
   * 3. Decodifica JWT localmente
   * 4. Valida tenantId, expiración y estructura
   * 5. Valida token con el backend
   * 6. Si no hay token válido, redirige al login
   * 
   * @returns Sesión con usuario, tenantId, roles y expiración
   * 
   * @example
   * ```typescript
   * const session = await auth.checkSession();
   * if (session) {
   *   console.log('Usuario:', session.user.email);
   *   console.log('Tenant:', session.tenantId);
   *   console.log('Roles en Console:', session.roles.console);
   * }
   * ```
   */
  async checkSession(): Promise<TGTSession | null> {
    return this._checkSessionCore({ silent: false, validateWithServer: true });
  }

  async checkSessionSilent(validateWithServer = true): Promise<TGTSession | null> {
    return this._checkSessionCore({ silent: true, validateWithServer });
  }

  /**
   * Lógica compartida entre checkSession y checkSessionSilent.
   * - silent=false: redirige a login si no hay sesión, dispara onAuthSuccess
   * - silent=true: retorna null silenciosamente, no dispara onAuthSuccess
   */
  private async _checkSessionCore(options: { silent: boolean; validateWithServer: boolean }): Promise<TGTSession | null> {
    const { silent, validateWithServer } = options;
    const label = silent ? ' - silent' : '';

    try {
      // 0️⃣ Si hay tempToken, estamos en flujo MFA - NO redirigir
      const tempToken = this.getTempToken();
      if (tempToken) {
        this.log(`🔹 Flujo MFA en progreso (tempToken detectado)${label}`);
        return null;
      }

      // 0.5️⃣ Limpiar localStorage si viene de un enlace de invitación
      this.handleClearAuthParam();

      // 0.6️⃣ OAuth PKCE callback detection — exchange ?code= for tokens
      // Guard: prevent double-execution from React Strict Mode dual-mount.
      // Using memory/window object instead of sessionStorage so the lock dies on page reload.
      if ((this.config.clientId || this.config.appKey) && (typeof window !== 'undefined')) {
        const callbackParams = new URLSearchParams(window.location.search);
        const oauthCode = callbackParams.get('code');
        if (oauthCode) {
          if ((window as any).__oauth_exchange_lock) {
            this.log(`🔹 OAuth callback ya en progreso (lock activo) — ignorando${label}`);
            // Still return the token if first exchange already completed
            const token = this.getStoredToken();
            if (token) {
              const session = this.buildSessionFromToken(token);
              return session;
            }
            return null;
          }
          (window as any).__oauth_exchange_lock = true;
          this.log(`🔹 OAuth callback detectado, intercambiando code...${label}`);
          try {
            await this.handleCallback();
            // handleCallback stores tokens + cleans URL — continue normal flow below
            (window as any).__oauth_exchange_lock = false;
          } catch (err: any) {
            this.log(`❌ OAuth callback falló: ${err?.message || err}${label}`);
            (window as any).__oauth_exchange_lock = false;
            if (!silent) this.handleNoSession();
            return null;
          }
        }
      }

      // 1️⃣ Intentar obtener token de URL (después de redirect desde identity)
      const urlToken = this.getTokenFromUrl();
      if (urlToken) {
        this.log(`🔹 Token encontrado en URL, guardando en localStorage${label}`);
        this.storeToken(urlToken);
        this.removeTokenFromUrl();

        const exchanged = await this.exchangeAccessToken();
        if (exchanged) {
          this.log(`✅ Token intercambiado por sesion completa (SSO exchange)${label}`);
          if (!this.getStoredRefreshToken()) {
            console.warn('[TGT Auth] SSO exchange exitoso pero el servidor no devolvió refresh token. La sesión no podrá renovarse automáticamente.');
          }
        } else {
          console.warn(`[TGT Auth] SSO exchange falló${label ? ' (silent)' : ''}. La sesión funciona con access token pero no podrá renovarse automáticamente.`);
        }
      }

      const token = this.getStoredToken();
      if (!token) {
        this.log(`❌ No hay token en localStorage${label}`);
        if (!silent) this.handleNoSession();
        return null;
      }

      this.log(`🔹 Decodificando JWT localmente...${label}`);
      
      // 3️⃣ Decodificar JWT localmente
      let decoded: JWTPayload;
      try {
        decoded = jwtDecode<JWTPayload>(token);
      } catch (error) {
        this.log(`❌ Error decodificando JWT${label}:`, error);
        this.clearStoredToken();
        if (!silent) this.handleNoSession();
        return null;
      }

      // 4️⃣ Validar que el JWT tenga tenantId
      if (!decoded.tenantId) {
        this.log(`❌ Token inválido: falta tenantId${label}`);
        this.clearStoredToken();
        if (!silent) this.handleNoSession();
        return null;
      }

      // 5️⃣ Validar expiración
      const now = Date.now();
      const expiresAt = new Date(decoded.exp * 1000);
      
      if (decoded.exp * 1000 < now) {
        this.log(`🔹 Token expirado${label}, intentando refresh...`);
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          const newToken = this.getStoredToken();
          if (newToken) {
            try {
              decoded = jwtDecode<JWTPayload>(newToken);
              if (!decoded.tenantId) {
                this.clearStoredToken();
                if (!silent) this.handleNoSession();
                return null;
              }
            } catch {
              this.clearStoredToken();
              if (!silent) this.handleNoSession();
              return null;
            }
          } else {
            this.clearStoredToken();
            if (!silent) this.handleNoSession();
            return null;
          }
        } else {
          this.clearStoredToken();
          if (!silent) this.handleNoSession();
          return null;
        }
      }

      this.log(`✅ JWT válido localmente${label}`);
      this.log(`🔹 Tenant:`, decoded.tenantId, '-', decoded.tenantName);
      this.log(`🔹 Expira:`, new Date(decoded.exp * 1000));
      this.log(`🔹 Roles:`, decoded.roles);

      // 6️⃣ Validar token con el backend (si aplica)
      if (validateWithServer) {
        this.log(`🔹 Verificando sesión con backend...${label}`);
        const appKey = this.getCurrentAppKey();
        const meUrl = appKey
          ? `${this.getMeUrl(appKey)}`
          : `${this.getMeUrl()}`;

        try {
          const response = await fetch(meUrl, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.getStoredToken()}`,
            },
          });

          if (!response.ok) {
            this.log(`❌ Backend rechazó el token (HTTP ${response.status})${label}`);
            
            // Intentar leer el error estructurado del backend
            let authError: AuthError | undefined;
            try {
              const errorData = await response.json();
              if (errorData.code && errorData.message) {
                authError = {
                  code: errorData.code as AuthErrorCode,
                  message: errorData.message,
                };
                this.log('❌ Error de autenticación:', authError.code, '-', authError.message);
              }
            } catch {
              // No se pudo parsear el error, continuar sin código
            }

            this.clearStoredToken();
            if (!silent) this.handleNoSession(authError);
            return null;
          }

          const data: SessionResponse = await response.json();
          // Normalize API response to ensure camelCase (backend now returns camelCase)
          const apiUser = data.user as any;
          const normalizedUser: TGTUser = {
            sub: apiUser.sub || apiUser.id,
            email: apiUser.email,
            emailVerified: apiUser.emailVerified ?? apiUser.email_verified ?? false,
            name: apiUser.name,
            tenantId: apiUser.tenantId ?? apiUser.tenant_id,
            tenantName: apiUser.tenantName ?? apiUser.tenant_name,
            roles: apiUser.roles || {},
          };
          const session: TGTSession = {
            user: normalizedUser,
            tenantId: decoded.tenantId,
            tenantName: decoded.tenantName,
            expiresAt: new Date(decoded.exp * 1000),
          };

          this.currentUser = normalizedUser;
          this.currentSession = session;
          
          this.log(`✅ Sesión válida${label}:`, data.user.email);
          if (!silent) this.config.onAuthSuccess(session);
          
          return session;
        } catch (err) {
          this.log(`❌ Error verificando sesión con backend${label}:`, err);

          if (!silent && err instanceof TypeError && err.message.includes('Failed to fetch')) {
            console.error(`
🚫 Error de Conexión - TGT Auth Client
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Origen:  ${typeof window !== 'undefined' ? window.location.origin : 'unknown'}
Destino: ${this.config.identityUrl}

Posibles causas:
1. Identity backend está offline
2. Problema de CORS
3. Red bloqueada
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            `);
          }
          return null;
        }
      }

      // 7️⃣ Sin validación server: construir sesión desde JWT decode
      const session: TGTSession = {
        user: {
          sub: decoded.sub,
          email: decoded.email,
          emailVerified: decoded.emailVerified,
          name: decoded.name,
          tenantId: decoded.tenantId,
          tenantName: decoded.tenantName,
          roles: decoded.roles,
        },
        tenantId: decoded.tenantId,
        tenantName: decoded.tenantName,
        expiresAt: new Date(decoded.exp * 1000),
      };

      this.currentUser = session.user;
      this.currentSession = session;
      return session;
    } catch (error) {
      this.log(`❌ Error en checkSession${label}:`, error);
      this.clearStoredToken();
      if (!silent) this.handleNoSession();
      return null;
    }
  }

  /**
   * Obtiene la sesión actual (sin hacer request).
   * Primero debes llamar a checkSession().
   * 
   * @returns Sesión en memoria o null
   */
  getSession(): TGTSession | null {
    return this.currentSession;
  }

  /**
   * Obtiene el usuario actual (sin hacer request).
   * Primero debes llamar a checkSession().
   * 
   * @returns Usuario en memoria o null
   */
  getUser(): TGTUser | null {
    return this.currentUser;
  }

  /**
   * Obtiene el tenant ID del usuario actual.
   * 
   * @returns ID del tenant o null
   */
  getTenantId(): string | null {
    return this.currentSession?.tenantId || null;
  }

  /**
   * Obtiene el token de autenticación actual.
   * 
   * @returns Token JWT o null si no hay sesión
   */
  getToken(): string | null {
    return this.getStoredToken();
  }

  /**
   * Obtiene el token de autenticación SIN necesidad de una instancia.
   * Útil para HTTP clients que se inicializan a nivel módulo antes
   * de que el AuthContext renderice.
   * 
   * @returns Token JWT o null si no hay sesión
   * 
   * @example
   * ```typescript
   * // En un api-client.ts a nivel módulo:
   * import { TGTAuthClient } from '@tgtone/auth-sdk';
   * 
   * const apiClient = new ApiClient({
   *   getToken: () => TGTAuthClient.getStoredToken(),
   * });
   * ```
   */
  static getStoredToken(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(TGTAuthClient.TOKEN_KEY);
    } catch {
      return null;
    }
  }

  /**
   * Redirige al login del Identity Provider.
   * Incluye el parámetro redirect para volver a esta app.
   */
  redirectToLogin(redirectUrl?: string): void {
    // If OAuth PKCE is configured (via appKey or explicit clientId), use authorize() instead
    if (this.config.clientId || this.config.appKey) {
      this.authorize({ redirectUrl });
      return;
    }

    let redirectParam = this.config.appDomain;

    if (redirectUrl && this.isRedirectAllowed(redirectUrl)) {
      redirectParam = encodeURIComponent(redirectUrl);
    }

    const loginUrl = this.getLoginUrl({ redirect: redirectParam });
    this.log('🔄 Redirigiendo a login:', loginUrl);
    window.location.href = loginUrl;
  }


  /**
   * Valida si una URL de redirect está permitida por la configuración.
   * Comprueba el host de la URL contra `allowedRedirectHosts`.
   */
  isRedirectAllowed(redirectUrl: string): boolean {
    try {
      const parsed = new URL(redirectUrl);
      const host = parsed.hostname;
      return this.config.allowedRedirectHosts.includes(host) || this.config.allowedRedirectHosts.includes(parsed.host);
    } catch (error) {
      return false;
    }
  }

  /**
   * Cierra la sesión del usuario.
   * Invalida el token en el backend y limpia el localStorage.
   */
  async logout(): Promise<void> {
    try {
      this.log('🔹 Cerrando sesión...');
      this.log('🔹 Origen:', typeof window !== 'undefined' ? window.location.origin : 'unknown');
      
      // Detener monitor antes de limpiar para evitar refresh fantasma
      this.stopHeartbeat();
      this.clearPermissionsCache();
      
      const token = this.getStoredToken();
      
      await fetch(this.getLogoutUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
      });

      this.currentUser = null;
      this.clearStoredToken();
      this.clearRefreshToken();
      this.clearTempToken();
      this.clearPermissionsCache();
      this.log('✅ Sesión cerrada');
      
      // Redirigir al login después del logout
      this.redirectToLogin();
      
    } catch (error) {
      this.log('❌ Error al cerrar sesión:', error);
      this.log('❌ Origen:', typeof window !== 'undefined' ? window.location.origin : 'unknown');
      this.clearStoredToken();
      this.clearRefreshToken();
      this.clearTempToken();
      // Forzar redirect de todas formas
      this.redirectToLogin();
    }
  }

  /**
   * Cierra la sesión del usuario sin redirigir al Identity Provider.
   *
   * Limpia tokens, sesión y caché de permisos localmente, e invalida el token
   * en el backend (best-effort). A diferencia de `logout()`, NO redirige al
   * login del Identity Provider.
   *
   * **Caso de uso:** Apps con acceso restringido a creadores (ej: Hub, que
   * solo permite usuarios @tgtone.cl / @tgtgroup.cl). Estas apps tienen su
   * propia página `/login` y manejan la redirección manualmente, evitando
   * el flujo SSO estándar que redirige a `identityUrl/login`.
   *
   * @example
   * ```typescript
   * // En un AuthContext de una app con acceso solo-creadores:
   * const session = await authClient.checkSessionSilent();
   * if (session && !isAllowedEmail(session.user?.email)) {
   *   // Sesión válida pero el dominio no está permitido → logout local
   *   await authClient.localLogout();
   *   // Redirigir a la propia página de login de la app
   *   window.location.href = '/login';
   * }
   * ```
   */
  async localLogout(): Promise<void> {
    try {
      this.log('🔹 Cerrando sesión (local)...');
      const token = this.getStoredToken();
      if (token) {
        await fetch(this.getLogoutUrl(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        }).catch(() => {});
      }
    } finally {
      this.currentUser = null;
      this.currentSession = null;
      this.clearStoredToken();
      this.clearRefreshToken();
      this.clearTempToken();
      this.clearPermissionsCache();
      this.stopSessionMonitor();
      this.log('✅ Sesión local cerrada');
    }
  }

  /**
   * Verifica el código MFA durante el login.
   * Este método se llama después de que el login retorna requiresMfa=true.
   * 
   * @param tempToken Token temporal recibido en el login
   * @param code Código de 6 dígitos del Google Authenticator
   * @returns Sesión completa si el código es válido
   * 
   * @example
   * ```typescript
   * // Después de login que retorna requiresMfa=true
   * const session = await auth.verifyMfa(tempToken, '123456');
   * if (session) {
   *   console.log('MFA verificado, sesión iniciada');
   * }
   * ```
   */
  async verifyMfa(tempToken: string, code: string): Promise<TGTSession | null> {
    try {
      this.log('🔹 Verificando código MFA...');

      const response = await fetch(this.getMfaVerifyLoginUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tempToken, code }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Código MFA inválido');
      }

      const data = await response.json();
      
      // ✅ Usar accessToken o token (igual que login/signup)
      const token = data.accessToken || data.token;
      
      if (!token) {
        throw new Error('Respuesta inválida del servidor: falta token');
      }

      // Guardar token final y limpiar temp token
      this.storeToken(token);
      if (data.refreshToken) {
        this.storeRefreshToken(data.refreshToken);
      }
      this.clearTempToken();

      // Decodificar y crear sesión
      const session = this.buildSessionFromToken(token);

      this.log('✅ MFA verificado correctamente');
      this.config.onAuthSuccess(session);
      
      return this.currentSession;

    } catch (error) {
      this.log('❌ Error verificando MFA:', error);
      throw error;
    }
  }

  /**
   * Verifica si el usuario tiene un rol específico en una app.
   * 
   * @param appName Nombre de la app (ej: 'zenith', 'baco', 'console')
   * @param roleName Nombre del rol (ej: 'admin', 'user', 'viewer')
   * @returns true si el usuario tiene el rol
   * 
   * @example
   * ```typescript
   * if (auth.hasRole('zenith', 'admin')) {
   *   // Mostrar panel de administración
   * }
   * ```
   */
  hasRole(appName: string, roleName: string): boolean {
    if (!this.currentUser) return false;
    
    const appRoles = this.currentUser.roles[appName] || [];
    return appRoles.includes(roleName);
  }

  /**
   * Obtiene todos los roles del usuario en una app específica.
   * 
   * @param appName Nombre de la app
   * @returns Array de roles o vacío
   */
  getRoles(appName: string): string[] {
    if (!this.currentUser) return [];
    return this.currentUser.roles[appName] || [];
  }

  /**
   * Verifica si el usuario tiene acceso a una app específica.
   * 
   * @param appName Nombre de la app
   * @returns true si tiene al menos un rol en la app
   */
  hasAccessToApp(appName: string): boolean {
    return this.getRoles(appName).length > 0;
  }

  // ==========================================================================
  // OAUTH 2.0 PKCE (v3)
  // ==========================================================================

  /**
   * Initiate OAuth PKCE authorization flow.
   * Redirects user to identity.tgtone.cl/v1/auth/authorize
   *
   * Stores code_verifier in sessionStorage (cleared on tab close).
   */
  async authorize(options?: { redirectUrl?: string }): Promise<void> {
    // clientId is derived from appKey in constructor, or set explicitly
    const clientId = this.config.clientId || this.config.appKey;
    let redirectUri = this.config.redirectUri
      || (typeof window !== 'undefined' ? `${window.location.protocol}//${this.config.appDomain}` : undefined);

    // Preserve Lovable auth marker so Lovable's auth bridge doesn't eat the OAuth code
    if (typeof window !== 'undefined' && redirectUri) {
      const lovableSha = new URLSearchParams(window.location.search).get('__lovable_sha');
      if (lovableSha) {
        const sep = redirectUri.includes('?') ? '&' : '?';
        redirectUri += `${sep}__lovable_sha=${encodeURIComponent(lovableSha)}`;
      }
    }

    if (!clientId) {
      throw new Error('appKey or clientId is required for OAuth PKCE. Set appKey in TGTAuthConfig.');
    }
    if (!redirectUri) {
      throw new Error('Could not determine redirectUri. Set redirectUri or appDomain in TGTAuthConfig.');
    }

    const { generatePKCE } = await import('./pkce');
    const { codeVerifier, codeChallenge } = await generatePKCE();

    // Store code_verifier in sessionStorage (NOT localStorage — cleared on tab close)
    sessionStorage.setItem('oauth_code_verifier', codeVerifier);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    if (options?.redirectUrl) {
      params.set('state', encodeURIComponent(options.redirectUrl));
    }

    const authorizeUrl = `${this.config.identityUrl}/login?${params}`;

    // 🔥 Si está en iframe, redirigir el iframe mismo a login (CSP ahora permite Lovable)
    this.log('🔄 Redirigiendo a identity...');
    window.location.href = authorizeUrl;
  }

  /**
   * Handle OAuth callback — exchange authorization code for tokens.
   * Call this on the page matching redirectUri (e.g., /auth/callback).
   *
   * Reads ?code= from URL, recovers code_verifier from sessionStorage,
   * POSTs to /v1/auth/token, stores resulting tokens.
   */
  async handleCallback(): Promise<TGTSession> {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');
    const state = urlParams.get('state');

    if (error) {
      throw new Error(`OAuth error: ${error}`);
    }

    if (!code) {
      throw new Error('No authorization code in callback URL');
    }

    const codeVerifier = sessionStorage.getItem('oauth_code_verifier');
    if (!codeVerifier) {
      throw new Error('Code verifier not found — possible CSRF or expired tab');
    }

    // Exchange code for tokens
    const clientId = this.config.clientId || this.config.appKey;
    const redirectUri = this.config.redirectUri
      || (typeof window !== 'undefined' ? `${window.location.protocol}//${this.config.appDomain}` : undefined);

    const response = await fetch(this.getTokenUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: 'Token exchange failed' }));
      throw new Error(err.message || 'Token exchange failed');
    }

    const data = await response.json();
    const token = data.accessToken || data.token || data.access_token;

    if (!token) {
      throw new Error('No token received from server');
    }

    this.storeToken(token);
    if (data.refreshToken || data.refresh_token) {
      this.storeRefreshToken(data.refreshToken || data.refresh_token);
    }

    // Clean up
    sessionStorage.removeItem('oauth_code_verifier');

    // Clean URL (remove ?code=...)
    window.history.replaceState({}, document.title, window.location.pathname);

    const session = this.buildSessionFromToken(token);
    this.config.onAuthSuccess?.(session);

    return session;
  }

  // ==========================================================================
  // PERMISSIONS (Plan-filtered)
  // ==========================================================================

  /**
   * Obtiene los permisos granulares del usuario, filtrados por el plan activo.
   * Los permisos se cachean en memoria por 30 minutos.
   * 
   * @param forceRefresh Forzar refresh ignorando caché
   * @returns Permisos del usuario o null si no hay sesión
   * 
   * @example
   * ```typescript
   * const perms = await auth.getPermissions();
   * if (perms) {
   *   const bacoPerms = perms.applications.find(a => a.applicationKey === 'baco');
   *   console.log('Plan modules:', bacoPerms?.planModules);
   *   console.log('Can read barricas:', bacoPerms?.permissions?.modules?.barricas?.read);
   * }
   * ```
   */
  async getPermissions(forceRefresh = false): Promise<UserPermissions | null> {
    if (!forceRefresh && this.permissionsCache && Date.now() < this.permissionsCacheExpiry) {
      this.log('📦 Usando caché de permisos');
      return this.permissionsCache;
    }

    const token = this.getStoredToken();
    if (!token) {
      this.log('❌ No hay token para obtener permisos');
      return null;
    }

    try {
      this.log('🔍 Obteniendo permisos desde API...');
      const response = await fetch(this.getPermissionsUrl(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        this.log('❌ Error obteniendo permisos (HTTP', response.status, ')');

        // Verificar si es un error de revocación de sesión
        try {
          const errorData = await response.json();
          if (errorData.code && errorData.message) {
            const errorCode = errorData.code as AuthErrorCode;
            if (isRevocationError(errorCode)) {
              this.log('❌ Permisos rechazados - sesión revocada:', errorCode);
              this.stopHeartbeat();
              this.handleSessionRevoked({ code: errorCode, message: errorData.message });
              return null;
            }
          }
        } catch {
          // No se pudo parsear el error
        }

        return null;
      }

      const permissions: UserPermissions = await response.json();
      this.permissionsCache = permissions;
      this.permissionsCacheExpiry = Date.now() + TGTAuthClient.PERMISSIONS_CACHE_TTL;

      this.log('✅ Permisos obtenidos:', permissions.applications.length, 'aplicaciones');
      permissions.applications.forEach(app => {
        this.log(`   - ${app.applicationKey}: planModules=${app.planModules?.join(',') || 'NONE'}`);
      });

      return permissions;
    } catch (error) {
      this.log('❌ Error obteniendo permisos:', error);
      return null;
    }
  }

  /**
   * Verifica si el usuario tiene un permiso específico en un módulo.
   * Obtiene los permisos del caché o hace fetch si es necesario.
   * 
   * @param module Key del módulo (ej: 'barricas', 'vinos')
   * @param action Acción a verificar (ej: 'read', 'create', 'vaciar')
   * @param appKey Key de la aplicación (opcional, usa la app actual si no se proporciona)
   * @returns true si el usuario tiene el permiso
   * 
   * @example
   * ```typescript
   * const canRead = await auth.hasModulePermission('barricas', 'read', 'baco');
   * const canVaciar = await auth.hasModulePermission('barricas', 'vaciar', 'baco');
   * ```
   */
  async hasModulePermission(module: string, action: string, appKey?: string): Promise<boolean> {
    const perms = await this.getPermissions();
    if (!perms) return false;

    const targetKey = appKey || this.getCurrentAppKey();
    if (!targetKey) return false;

    const appPerms = perms.applications.find(a => a.applicationKey === targetKey);
    if (!appPerms?.permissions?.modules?.[module]) return false;

    return appPerms.permissions.modules[module][action] === true;
  }

  /**
   * Obtiene los módulos activos del plan para una aplicación.
   * 
   * @param appKey Key de la aplicación (opcional, usa la app actual)
   * @returns Array de module keys o null
   */
  async getPlanModules(appKey?: string): Promise<string[] | null> {
    const perms = await this.getPermissions();
    if (!perms) return null;

    const targetKey = appKey || this.getCurrentAppKey();
    if (!targetKey) return null;

    const appPerms = perms.applications.find(a => a.applicationKey === targetKey);
    return appPerms?.planModules || null;
  }

  /**
   * Limpia el caché de permisos en memoria.
   * Se debe llamar cuando cambian los roles del usuario o el plan.
   */
  clearPermissionsCache(): void {
    this.permissionsCache = null;
    this.permissionsCacheExpiry = 0;
    this.log('🧹 Caché de permisos limpiado');
  }

  // ==========================================================================
  // SESSION MONITOR / REFRESH
  // ==========================================================================

  /**
   * Inicia el monitor de sesión que refresca el token proactivamente.
   * 
   * Cada `heartbeatIntervalMs` milisegundos, verifica si el access token
   * está próximo a expirar y lo refresca automáticamente usando el refresh token.
   * 
   * @example
   * ```typescript
   * auth.startSessionMonitor();
   * auth.stopSessionMonitor();
   * ```
   */
  startSessionMonitor(): void {
    if (this.config.heartbeatIntervalMs === 0) {
      this.log('🔹 Session monitor deshabilitado (interval = 0)');
      return;
    }

    if (this.isHeartbeatRunning) {
      this.log('⚠️ Session monitor ya está corriendo');
      return;
    }

    this.log(`🔹 Iniciando session monitor cada ${this.config.heartbeatIntervalMs / 1000}s`);
    this.isHeartbeatRunning = true;

    // Conectar Session Cache (WebSocket + REST fallback + heartbeat directo)
    if (this.config.sessionCacheUrl) {
      this.connectSessionCache();
      this.startSessionCheckFallback();
      this.startDirectHeartbeat();
    }

    // Detectar wake-from-suspend (PC suspendido → browser reanuda pestañas)
    this._startVisibilityListener();

    this.heartbeatTimer = setInterval(async () => {
      try {
        const token = this.getStoredToken();
        if (!token) {
          this.log('💓 Monitor: no hay token, deteniendo');
          this.stopSessionMonitor();
          return;
        }

        let decoded: JWTPayload;
        try {
          decoded = jwtDecode<JWTPayload>(token);
        } catch {
          this.log('💓 Monitor: token ilegible, deteniendo');
          this.stopSessionMonitor();
          return;
        }

        const now = Date.now();
        const expiresInMillis = decoded.exp * 1000 - now;

        if (expiresInMillis < TGTAuthClient.REFRESH_BEFORE_EXPIRY_MS) {
          this.log('💓 Monitor: token próximo a expirar, refrescando...');
          const refreshed = await this.refreshAccessToken();
          if (!refreshed) {
            this.log('💓 Monitor: refresh falló');
          }
        }

        this.clearPermissionsCache();
        if (this.config.onPermissionsStale) {
          this.config.onPermissionsStale();
        }
      } catch (error) {
        this.log('💓 Monitor: error (ignorando):', error);
      }
    }, this.config.heartbeatIntervalMs);
  }

  /**
   * Detiene el monitor de sesión.
   */
  stopSessionMonitor(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      this.isHeartbeatRunning = false;
      this.log('🔹 Session monitor detenido');
    }
    // Detener también Session Cache (WS + REST fallback + heartbeat directo)
    this.stopSessionCache();
    this.stopDirectHeartbeat();
    this._stopVisibilityListener();
  }

  /**
   * Verifica si el monitor de sesión está activo.
   */
  isSessionMonitorActive(): boolean {
    return this.isHeartbeatRunning;
  }

  /**
   * @deprecated Usar `startSessionMonitor()` en su lugar.
   */
  startHeartbeat(): void {
    this.startSessionMonitor();
  }

  /**
   * @deprecated Usar `stopSessionMonitor()` en su lugar.
   */
  stopHeartbeat(): void {
    this.stopSessionMonitor();
  }

  /**
   * @deprecated Usar `isSessionMonitorActive()` en su lugar.
   */
  isHeartbeatActive(): boolean {
    return this.isSessionMonitorActive();
  }

  // ==========================================================================
  // SESSION CACHE — WebSocket + REST fallback
  // ==========================================================================

  /**
   * Hashea el refresh token con SHA-256 (mismo algoritmo que el backend).
   */
  private async hashToken(token: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Conecta al WebSocket del Session Cache VPS.
   * Recibe notificaciones de revocación en tiempo real.
   */
  private connectSessionCache(): void {
    if (!this.config.sessionCacheUrl || typeof WebSocket === 'undefined') return;

    // Cerrar conexión previa si existe
    this.disconnectSessionCache();

    const wsUrl = this.config.sessionCacheUrl.replace(/^http/, 'ws') + '/ws';
    this.log(`🔹 Conectando Session Cache WS: ${wsUrl}`);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.log('✅ Session Cache WS conectado');
        // Autenticar: enviar userId al Session Cache
        try {
          const token = this.getStoredToken()
          const userId = this.currentUser?.sub || (token ? jwtDecode<JWTPayload>(token).sub : null)
          if (userId) {
            this.ws!.send(JSON.stringify({ type: 'auth', userId }))
            this.log(`🔹 WS auth enviado para userId: ${userId.substring(0, 8)}...`)
          }
        } catch (err) {
          this.log('⚠️ WS auth falló:', err)
        }
      };

      this.ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          switch (data.type) {
            case 'session:revoked': {
              const myUserId = this.currentUser?.sub;
              if (myUserId && myUserId === data.userId) {
                this.log('🚫 Session Cache: sesión revocada instantáneamente');
                this.stopSessionMonitor();
                this.handleSessionRevoked({
                  code: 'USER_INACTIVE',
                  message: 'Tu sesión fue cerrada en otro dispositivo.',
                });
              }
              break;
            }
            case 'ROLES_CHANGED': {
              const { appKey, roles } = data.payload || {};
              this.log('🔄 Session Cache: roles cambiados', appKey, roles);
              this.clearPermissionsCache();
              this.config.onPermissionsChanged?.(appKey, roles);
              break;
            }
            case 'ACCESS_REVOKED': {
              const { appKey, reason } = data.payload || {};
              this.log('🚫 Session Cache: acceso revocado', appKey, reason);
              this.clearPermissionsCache();
              this.config.onAccessRevoked?.(appKey, reason);
              const reasonLabel = reason === 'roles_removed' ? 'tus roles fueron removidos'
                : reason === 'subscription_blocked' ? 'tu suscripción fue bloqueada'
                : reason === 'subscription_deleted' ? 'tu suscripción fue eliminada'
                : reason === 'app_removed' ? 'la app fue removida'
                : reason;
              if (appKey === this.getCurrentAppKey()) {
                this.showBlockedPage({
                  code: 'ACCESS_REVOKED' as AuthErrorCode,
                  message: `Tu acceso a ${appKey} fue revocado: ${reasonLabel}.`,
                });
              }
              break;
            }
            case 'SESSION_REVOKED_BULK': {
              const { tenantId, reason } = data.payload || {};
              const myTenantId = this.currentUser?.tenantId || this.currentSession?.tenantId;
              if (myTenantId === tenantId) {
                this.log(`🚫 Session Cache: sesión revocada masivamente (${reason})`);
                this.stopSessionMonitor();
                this.handleSessionRevoked({
                  code: 'TENANT_INACTIVE',
                  message: `Tu organización fue ${reason === 'tenant_deleted' ? 'eliminada' : 'suspendida'}.`,
                });
              }
              break;
            }
          }
        } catch {
          // ignorar mensajes no parseables
        }
      };

      this.ws.onclose = () => {
        this.log('🔹 Session Cache WS desconectado');
        this.ws = null;
        // Reconnect después de 5s (solo si sigue habiendo sesión)
        if (this.getStoredToken()) {
          this.wsReconnectTimer = setTimeout(() => this.connectSessionCache(), 5000);
        }
      };

      this.ws.onerror = () => {
        this.log('⚠️ Session Cache WS error');
        // onclose se disparará después de onerror
      };
    } catch (err) {
      this.log('⚠️ Session Cache WS falló:', err);
    }
  }

  /**
   * Desconecta el WebSocket del Session Cache.
   */
  private disconnectSessionCache(): void {
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null; // evitar el auto-reconnect
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Inicia el REST fallback: cada 1 minuto consulta al Session Cache
   * si la sesión sigue válida (cuando WS no está disponible).
   */
  private startSessionCheckFallback(): void {
    if (!this.config.sessionCacheUrl) return;

    this.stopSessionCheckFallback();

    this.sessionCheckTimer = setInterval(async () => {
      const userId = this.currentUser?.sub;
      if (!userId) return;

      try {
        const checkUrl = `${this.config.sessionCacheUrl}/api/session/check/${userId}`;
        const res = await fetch(checkUrl, { signal: AbortSignal.timeout(5000) });

        if (res.ok) {
          const body = await res.json();
          if (body.valid === false) {
            this.log('⚠️ Session Cache: key expirada (posible suspensión), intentando wake refresh...');
            const revived = await this._tryWakeRefresh();
            if (revived) {
              this.log('✅ Sesión reanimada tras suspensión');
              return;
            }
            this.log('🚫 Wake refresh falló — sesión realmente expirada');
            this.stopSessionMonitor();
            this.handleSessionRevoked({
              code: 'SESSION_EXPIRED',
              message: 'Tu sesión expiró por inactividad.',
            });
          }
        }
      } catch {
        // Timeout o error de red — ignorar, reintenta en 1 min
      }
    }, TGTAuthClient.SESSION_CHECK_INTERVAL_MS);
  }

  /**
   * Detiene el REST fallback.
   */
  private stopSessionCheckFallback(): void {
    if (this.sessionCheckTimer) {
      clearInterval(this.sessionCheckTimer);
      this.sessionCheckTimer = null;
    }
  }

  /**
   * Intenta reanimar la sesión tras detectar key expirada en Redis.
   * Usa el refresh token (válido 7 días) para obtener un nuevo access token
   * y re-registrar la sesión en el Session Cache.
   * 
   * Escenario típico: PC suspendido → Redis key expira → browser despierta
   * → el refresh token sigue vigente → se regenera todo sin mostrar login.
   */
  private async _tryWakeRefresh(): Promise<boolean> {
    if (this._wakeInProgress) return false;
    this._wakeInProgress = true;

    try {
      // Pausa para que el network stack se recupere (DHCP, WiFi reconnect, etc.)
      await new Promise(r => setTimeout(r, 3000));

      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        // Re-registrar en Redis via heartbeat directo
        if (this.config.sessionCacheUrl && this.currentUser?.sub) {
          try {
            await fetch(`${this.config.sessionCacheUrl}/api/session/heartbeat`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: this.currentUser.sub }),
              signal: AbortSignal.timeout(5000),
            });
          } catch {
            // Silencioso — el heartbeat directo del próximo ciclo lo re-registrará
          }
        }
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      this._wakeInProgress = false;
    }
  }

  /**
   * Listener de visibilidad del browser para detectar wake-from-suspend.
   * Cuando la pestaña vuelve a ser visible tras estar oculta (suspensión del PC,
   * cambio de pestaña prolongado), dispara un refresh proactivo del token
   * sin esperar al ciclo de 1 min del session check.
   */
  private _visibilityWakeHandler = async (): Promise<void> => {
    if (document.visibilityState !== 'visible') return;
    if (!this.currentUser?.sub) return;

    this.log('👁️ Tab visible — verificando sesión post-suspensión...');
    await this._tryWakeRefresh();
  }

  private _startVisibilityListener(): void {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', this._visibilityWakeHandler);
    window.addEventListener('pageshow', this._visibilityWakeHandler);
  }

  private _stopVisibilityListener(): void {
    if (typeof document === 'undefined') return;
    document.removeEventListener('visibilitychange', this._visibilityWakeHandler);
    window.removeEventListener('pageshow', this._visibilityWakeHandler);
  }

  /**
   * Detiene toda la conexión al Session Cache (WS + REST fallback).
   */
  private stopSessionCache(): void {
    this.disconnectSessionCache();
    this.stopSessionCheckFallback();
  }

  /**
   * Heartbeat directo browser → Session Cache (Linode).
   * Mantiene viva la key en Redis sin pasar por el backend Cloud Run.
   * Cada `heartbeatIntervalMs` hace POST a /api/session/heartbeat.
   */
  private startDirectHeartbeat(): void {
    if (!this.config.sessionCacheUrl) return;
    if (this.directHeartbeatTimer) return;

    const interval = this.config.heartbeatIntervalMs;
    this.log(`🔹 Heartbeat directo cada ${interval / 1000}s`);

    this.directHeartbeatTimer = setInterval(async () => {
      const userId = this.currentUser?.sub;
      if (!userId) return;

      try {
        const url = `${this.config.sessionCacheUrl}/api/session/heartbeat`;
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        // Error de red o timeout — reintentará en el próximo ciclo
      }
    }, interval);
  }

  /**
   * Detiene el heartbeat directo al Session Cache.
   */
  private stopDirectHeartbeat(): void {
    if (this.directHeartbeatTimer) {
      clearInterval(this.directHeartbeatTimer);
      this.directHeartbeatTimer = null;
      this.log('🔹 Heartbeat directo detenido');
    }
  }

  /**
   * Genera la URL de redirección para sesión revocada.
   * 
   * @param error Error de autenticación
   * @returns URL completa a la página de blocked
   */
  getBlockedRedirectUrl(error: AuthError): string {
    const type = this.mapErrorCodeToBlockedType(error.code);
    const redirect = typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : '';
    return `${this.config.identityUrl}/blocked?type=${type}&message=${encodeURIComponent(error.message)}&redirect=${redirect}`;
  }

  // ==========================================================================
  // URL HELPERS — centralized auth route builders
  // ==========================================================================

  /** Base URL for auth REST API */
  private get authApiBase(): string {
    return `${this.config.identityUrl}/api/v1/auth`;
  }

  /**
   * URL de la página de login.
   * @param params.opts Opcionales: redirect, clientId para OAuth
   */
  getLoginUrl(params?: { redirect?: string; clientId?: string }): string {
    let url = `${this.config.identityUrl}/login`;
    const qs = new URLSearchParams();
    if (params?.redirect) qs.set('redirect', params.redirect);
    if (params?.clientId) qs.set('client_id', params.clientId);
    const q = qs.toString();
    if (q) url += `?${q}`;
    return url;
  }

  /** URL del endpoint signup */
  getSignupUrl(): string {
    return `${this.authApiBase}/signup`;
  }

  /** URL del endpoint login (API REST) */
  getLoginApiUrl(): string {
    return `${this.authApiBase}/login`;
  }

  /** URL del endpoint /me */
  getMeUrl(appKey?: string): string {
    if (appKey) return `${this.authApiBase}/me?app=${encodeURIComponent(appKey)}`;
    return `${this.authApiBase}/me`;
  }

  /** URL del endpoint logout */
  getLogoutUrl(): string {
    return `${this.authApiBase}/logout`;
  }

  /** URL del endpoint refresh */
  getRefreshUrl(): string {
    return `${this.authApiBase}/refresh`;
  }

  /** URL del endpoint token exchange (OAuth callback) */
  getTokenUrl(): string {
    return `${this.authApiBase}/token`;
  }

  /** URL del endpoint exchange */
  getExchangeUrl(): string {
    return `${this.authApiBase}/exchange`;
  }

  /** URL del endpoint MFA setup */
  getMfaSetupUrl(): string {
    return `${this.authApiBase}/mfa/setup`;
  }

  /** URL del endpoint MFA verify-setup */
  getMfaVerifySetupUrl(): string {
    return `${this.authApiBase}/mfa/verify-setup`;
  }

  /** URL del endpoint MFA verify (login) */
  getMfaVerifyLoginUrl(): string {
    return `${this.authApiBase}/mfa/verify`;
  }

  /** URL del endpoint MFA disable */
  getMfaDisableUrl(): string {
    return `${this.authApiBase}/mfa/disable`;
  }

  /** URL del endpoint check-email */
  getCheckEmailUrl(): string {
    return `${this.authApiBase}/check-email`;
  }

  /** URL del endpoint change-password */
  getChangePasswordUrl(): string {
    return `${this.authApiBase}/change-password`;
  }

  /** URL del endpoint permissions */
  getPermissionsUrl(): string {
    return `${this.config.identityUrl}/api/v1/users/me/permissions`;
  }

  /**
   * Mustra una página de sesión bloqueada.
   * Si hay callback onSessionRevoked, lo ejecuta.
   * Si no, renderiza un overlay HTML inline con el mensaje de error.
   */
  showBlockedPage(error: AuthError): void {
    if (this.config.onSessionRevoked) {
      this.config.onSessionRevoked(error);
      return;
    }
    const url = this.getBlockedRedirectUrl(error);
    window.location.href = url;
  }

  /**
   * Maneja una sesión revocada.
   * 
   * Si hay un callback `onSessionRevoked`, lo ejecuta.
   * De lo contrario, limpia el token y redirige a la página de blocked.
   */
  private handleSessionRevoked(error: AuthError): void {
    this.log('🚫 Sesión revocada:', error.code, '-', error.message);
    
    // Limpiar sesión local
    this.currentUser = null;
    this.currentSession = null;
    this.clearStoredToken();
    this.clearRefreshToken();
    this.clearTempToken();
    this.clearPermissionsCache();

    if (this.config.onSessionRevoked) {
      this.config.onSessionRevoked(error);
    } else {
      // Comportamiento por defecto: redirigir a blocked
      const blockedUrl = this.getBlockedRedirectUrl(error);
      this.log('🔄 Redirigiendo a blocked:', blockedUrl);
      window.location.href = blockedUrl;
    }
  }

  private isRevocationErrorCode(code: AuthErrorCode): boolean {
    return isRevocationError(code);
  }

  /**
   * Mapea códigos de error a tipos para la página de blocked.
   */
  private mapErrorCodeToBlockedType(code: AuthErrorCode): string {
    const mapping: Record<AuthErrorCode, string> = {
      'TENANT_INACTIVE': 'tenant',
      'USER_INACTIVE': 'user',
      'USER_NOT_FOUND': 'user',
      'SESSION_EXPIRED': 'expired',
      'ACCESS_REVOKED': 'access',
      'APP_SUBSCRIPTION_LOCKED': 'subscription',
      'TRIAL_EXPIRED': 'trial',
    };
    return mapping[code] || 'unknown';
  }

  // ==========================================================================
  // MÉTODOS PRIVADOS
  // ==========================================================================

  /**
   * Decodifica un JWT y actualiza currentUser + currentSession.
   * Retorna la sesión creada. Lanza error si el token no se puede decodificar.
   */
  private buildSessionFromToken(token: string): TGTSession {
    const payload = jwtDecode<JWTPayload>(token);

    this.currentUser = {
      sub: payload.sub,
      email: payload.email,
      emailVerified: payload.emailVerified,
      name: payload.name,
      tenantId: payload.tenantId,
      tenantName: payload.tenantName,
      roles: payload.roles,
    };

    this.currentSession = {
      user: this.currentUser,
      tenantId: payload.tenantId,
      tenantName: payload.tenantName,
      expiresAt: new Date(payload.exp * 1000),
    };

    return this.currentSession;
  }

  private async exchangeAccessToken(): Promise<boolean> {
    const token = this.getStoredToken();
    if (!token) {
      this.log('❌ No hay token para exchange');
      return false;
    }

    try {
      this.log('🔹 Intercambiando access token por sesion completa (exchange)...');
      const response = await fetch(this.getExchangeUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        this.log('⚠️ Exchange falló (HTTP', response.status, '), continuando sin refresh token');
        return false;
      }

      const data = await response.json();
      const newToken = data.accessToken || data.token;
      if (newToken) {
        this.storeToken(newToken);
      }
      if (data.refreshToken) {
        this.storeRefreshToken(data.refreshToken);
      }

      if (newToken) {
        try {
          this.buildSessionFromToken(newToken);
        } catch {
          this.log('⚠️ Exchange OK pero no se pudo decodificar el nuevo token');
        }
      }

      return true;
    } catch (error) {
      this.log('⚠️ Exchange error:', error);
      return false;
    }
  }

  async refreshAccessToken(): Promise<boolean> {
    // Si ya hay un refresh en vuelo, reutilizamos la misma Promise
    if (this.refreshPromise) {
      this.log('🔹 Refresh ya en progreso, reutilizando Promise existente...');
      return this.refreshPromise;
    }

    // Creamos la Promise y la almacenamos para que llamadas concurrentes la reutilicen
    this.refreshPromise = this._executeRefresh();

    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async _executeRefresh(): Promise<boolean> {
    const refreshToken = this.getStoredRefreshToken();
    if (!refreshToken) {
      this.log('❌ No hay refresh token');
      return false;
    }

    this.log('🔹 Refrescando access token...');
    try {
      const response = await fetch(this.getRefreshUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        let authError: AuthError | undefined;
        try {
          const errorData = await response.json();
          if (errorData.code && errorData.message) {
            authError = {
              code: errorData.code as AuthErrorCode,
              message: errorData.message,
            };
          }
        } catch {
          // ignore parse errors
        }

        if (authError && isRevocationError(authError.code)) {
          this.log('❌ Refresh rechazado - sesión revocada:', authError.code);
          this.stopHeartbeat();
          this.handleSessionRevoked(authError);
          return false;
        }

        this.log('❌ Refresh falló (HTTP', response.status, ')');
        this.clearRefreshToken();
        return false;
      }

      const data = await response.json();
      const newToken = data.accessToken || data.token;
      if (!newToken) {
        this.log('❌ Refresh: respuesta sin token');
        return false;
      }

      this.storeToken(newToken);
      if (data.refreshToken) {
        this.storeRefreshToken(data.refreshToken);
      }

      try {
        this.buildSessionFromToken(newToken);
      } catch {
        this.log('⚠️ Refresh OK pero no se pudo decodificar el nuevo token');
      }

      this.log('✅ Access token refrescado');
      return true;
    } catch (error) {
      this.log('❌ Error en refresh:', error);
      return false;
    }
  }

  /**
   * Obtiene el token de la URL (query parameter)
   * Se usa después de la redirección desde el Identity Provider
   */
  private getTokenFromUrl(): string | null {
    if (typeof window === 'undefined') return null;
    
    const params = new URLSearchParams(window.location.search);
    return params.get('token');
  }

  /**
   * Remueve el token de la URL para que no quede visible
   */
  private removeTokenFromUrl(): void {
    if (typeof window === 'undefined') return;
    
    const url = new URL(window.location.href);
    url.searchParams.delete('token');
    
    // Reemplazar URL sin recargar la página
    window.history.replaceState({}, '', url.toString());
  }

  /**
   * Detecta el parámetro `clearAuth` en la URL y limpia localStorage.
   * Se usa en correos de invitación para asegurar un estado limpio.
   */
  private handleClearAuthParam(): boolean {
    if (typeof window === 'undefined') return false;

    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('clearAuth') === '1') {
        this.log('🧹 clearAuth detectado - limpiando localStorage');
        localStorage.removeItem(TGTAuthClient.TOKEN_KEY);
        localStorage.removeItem(TGTAuthClient.TEMP_TOKEN_KEY);
        localStorage.removeItem(TGTAuthClient.REFRESH_TOKEN_KEY);

        const url = new URL(window.location.href);
        url.searchParams.delete('clearAuth');
        window.history.replaceState({}, '', url.toString());
        return true;
      }
    } catch (error) {
      this.log('❌ Error procesando clearAuth:', error);
    }

    return false;
  }

  /**
   * Obtiene la app actual desde el appDomain configurado.
   * Ejemplos:
   * - baco.tgtone.cl -> baco
   * - zenith.tgtone.cl -> zenith
   * - localhost:5173 -> undefined
   */
  private getCurrentAppKey(): string | undefined {
    if (this.config.appKey) {
      return this.config.appKey;
    }

    const host = this.config.appDomain?.split(':')[0]?.toLowerCase();
    if (!host || host === 'localhost' || host === '127.0.0.1') {
      return undefined;
    }

    const parts = host.split('.').filter(Boolean);
    if (parts.length < 3) {
      return undefined;
    }

    return parts[0].replace(/^(dev-|staging-|test-)/, '');
  }

  /**
   * Guarda el token en localStorage
   */
  private storeToken(token: string): void {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.setItem(TGTAuthClient.TOKEN_KEY, token);
      this.log('✅ Token guardado en localStorage');
    } catch (error) {
      this.log('❌ Error guardando token:', error);
    }
  }

  /**
   * Obtiene el token guardado en localStorage
   */
  private getStoredToken(): string | null {
    if (typeof window === 'undefined') return null;
    
    try {
      return localStorage.getItem(TGTAuthClient.TOKEN_KEY);
    } catch (error) {
      this.log('❌ Error leyendo token:', error);
      return null;
    }
  }

  /**
   * Elimina el token de localStorage
   */
  private clearStoredToken(): void {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.removeItem(TGTAuthClient.TOKEN_KEY);
      this.log('✅ Token eliminado de localStorage');
    } catch (error) {
      this.log('❌ Error eliminando token:', error);
    }
  }

  /**
   * Guarda el token temporal de MFA en localStorage
   */
  private storeTempToken(tempToken: string): void {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.setItem(TGTAuthClient.TEMP_TOKEN_KEY, tempToken);
      this.log('✅ Token temporal MFA guardado');
    } catch (error) {
      this.log('❌ Error guardando token temporal:', error);
    }
  }

  /**
   * Obtiene el token temporal de MFA guardado
   */
  private getTempToken(): string | null {
    if (typeof window === 'undefined') return null;
    
    try {
      return localStorage.getItem(TGTAuthClient.TEMP_TOKEN_KEY);
    } catch (error) {
      this.log('❌ Error leyendo token temporal:', error);
      return null;
    }
  }

  /**
   * Elimina el token temporal de MFA de localStorage
   */
  private clearTempToken(): void {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.removeItem(TGTAuthClient.TEMP_TOKEN_KEY);
      this.log('✅ Token temporal MFA eliminado');
    } catch (error) {
      this.log('❌ Error eliminando token temporal:', error);
    }
  }

  private storeRefreshToken(token: string): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(TGTAuthClient.REFRESH_TOKEN_KEY, token);
      this.log('✅ Refresh token guardado');
    } catch (error) {
      this.log('❌ Error guardando refresh token:', error);
    }
  }

  private getStoredRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;

    try {
      return localStorage.getItem(TGTAuthClient.REFRESH_TOKEN_KEY);
    } catch (error) {
      this.log('❌ Error leyendo refresh token:', error);
      return null;
    }
  }

  private clearRefreshToken(): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.removeItem(TGTAuthClient.REFRESH_TOKEN_KEY);
      this.log('✅ Refresh token eliminado');
    } catch (error) {
      this.log('❌ Error eliminando refresh token:', error);
    }
  }

  private handleNoSession(error?: AuthError): void {
    if (error && isRevocationError(error.code)) {
      this.handleSessionRevoked(error);
      return;
    }

    if (this.config.onAuthFailure) {
      this.config.onAuthFailure(error);
    } else {
      this.redirectToLogin();
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private log(...args: any[]): void {
    if (this.config.debug) {
      console.log('[TGT Auth]', ...args);
    }
  }
}

// ============================================================================
// UTILIDADES EXPORTADAS
// ============================================================================

/**
 * Códigos de error que indican que la sesión debe ser bloqueada.
 * Incluye revocación de sesión (usuario/tenant eliminado) y
 * bloqueo de acceso (suscripción bloqueada, trial expirado).
 */
export const REVOCATION_ERROR_CODES: AuthErrorCode[] = [
  'TENANT_INACTIVE',
  'USER_INACTIVE',
  'USER_NOT_FOUND',
  'SESSION_EXPIRED',
  'ACCESS_REVOKED',
  'APP_SUBSCRIPTION_LOCKED',
  'TRIAL_EXPIRED',
];

/**
 * Determina si un código de error indica revocación de sesión.
 * 
 * @param code Código de error
 * @returns true si el código indica que la sesión fue revocada
 * 
 * @example
 * ```typescript
 * import { isRevocationError } from '@tgtone/auth-sdk';
 * 
 * if (isRevocationError(error.code)) {
 *   // La sesión fue revocada - usuario/tenant eliminado
 *   handleSessionRevoked();
 * }
 * ```
 */
export function isRevocationError(code: AuthErrorCode): boolean {
  return REVOCATION_ERROR_CODES.includes(code);
}

// ============================================================================
// EXPORT DEFAULT
// ============================================================================

export default TGTAuthClient;
