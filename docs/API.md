# API Reference — @tgtone/auth-sdk

> v4.0.1 · SDK de autenticación centralizada para TGT One

---

## TGTAuthClient

Constructor principal. Maneja JWT, sesión, OAuth PKCE, heartbeat y WebSocket.

```typescript
import { TGTAuthClient } from '@tgtone/auth-sdk';

const auth = new TGTAuthClient(config: TGTAuthConfig);
```

### TGTAuthConfig

```typescript
interface TGTAuthConfig {
  coreApiUrl: string;              // URL del Core API (ej: https://dev-core.tgtone.cl/api)
  appDomain: string;                // Dominio de la app (window.location.host)
  appKey?: string;                  // Key de la app (ej: 'console'). Requerido en dev
  redirectUri?: string;             // Custom redirect URI (default: appDomain)
  clientId?: string;                // Explicit OAuth client ID (default: appKey)
  sessionCacheUrl?: string;         // URL del session cache WS (https://session.tgtone.cl)
  heartbeatIntervalMs?: number;     // Intervalo heartbeat (default: 300000 = 5 min)
  allowedRedirectHosts?: string[];  // Hosts permitidos para redirectToLogin
  debug?: boolean;                  // Logs en consola
  popupAuthEnabled?: boolean;       // (deprecado)

  // Callbacks
  onAuthSuccess?: (session: TGTSession) => void;
  onAuthFailure?: (error?: AuthError) => void;
  onSessionRevoked?: (error: AuthError) => void;
  onPermissionsChanged?: (appKey: string, roles: string[]) => void;
  onAccessRevoked?: (appKey: string, reason: string) => void;
}
```

---

## Métodos

### Autenticación

#### `signup(data)`
Crea cuenta nueva (usuario + tenant).

```typescript
auth.signup(data: {
  email: string;
  password?: string;
  firstName: string;
  lastName: string;
  tenantName: string;
}): Promise<AuthResponse>
```

#### `login(data)`
Inicia sesión con email y contraseña. Si el usuario tiene MFA, retorna `requiresMfa: true` + `tempToken`.

```typescript
auth.login(data: {
  email: string;
  password: string;
  targetApp?: string;
}): Promise<AuthResponse>
```

#### `verifyMfa(tempToken, code)`
Completa verificación MFA con código de Google Authenticator.

```typescript
auth.verifyMfa(tempToken: string, code: string): Promise<TGTSession | null>
```

#### `logout()`
Invalida token en backend, limpia localStorage y redirige a login.

```typescript
auth.logout(): Promise<void>
```

#### `localLogout()`
Limpia sesión localmente SIN redirigir a login.

```typescript
auth.localLogout(): Promise<void>
```

---

### Sesión

#### `checkSession()`
Valida sesión existente. **Redirige a login si no hay sesión válida** (o a `/blocked` si el error es de revocación).

```typescript
auth.checkSession(): Promise<TGTSession | null>
```

#### `checkSessionSilent(validateWithServer?)`
Valida sesión **sin redirigir**. Útil para landing pages que muestran contenido condicional.

```typescript
auth.checkSessionSilent(validateWithServer = true): Promise<TGTSession | null>
```

| Parámetro | Default | Descripción |
|-----------|---------|-------------|
| `validateWithServer` | `true` | Si `false`, solo valida JWT localmente (más rápido) |

#### `getSession()`
Retorna sesión en memoria (sin request).

```typescript
auth.getSession(): TGTSession | null
```

#### `getUser()`
Retorna usuario en memoria.

```typescript
auth.getUser(): TGTUser | null
```

#### `getTenantId()`
Retorna ID del tenant actual.

```typescript
auth.getTenantId(): string | null
```

#### `getToken()`
Retorna el JWT desde localStorage.

```typescript
auth.getToken(): string | null
```

#### `getStoredToken()`
**Método estático.** Obtiene el JWT sin necesitar una instancia de `TGTAuthClient`. Útil para HTTP clients que se inicializan a nivel módulo.

```typescript
TGTAuthClient.getStoredToken(): string | null
```

#### `redirectToLogin(redirectUrl?)`
Redirige al login de Identity. Si hay OAuth PKCE configurado (appKey/clientId), usa flujo `authorize()`.

```typescript
auth.redirectToLogin(redirectUrl?: string): void
```

#### `isRedirectAllowed(url)`
Verifica si una URL está en `allowedRedirectHosts`.

```typescript
auth.isRedirectAllowed(url: string): boolean
```

#### `isRedirecting()`
Indica si el SDK está en proceso de redirigir al login. Usado por `useTGTAuth` para mantener `loading=true` hasta que la navegación complete.

```typescript
auth.isRedirecting(): boolean
```

---

### Sesión Monitor (Heartbeat + WS)

#### `startSessionMonitor()`
Inicia heartbeat (cada 5 min) + conexión WebSocket al session cache.

```typescript
auth.startSessionMonitor(): void
```

#### `stopSessionMonitor()`
Detiene el monitor.

```typescript
auth.stopSessionMonitor(): void
```

#### `isSessionMonitorActive()`
Retorna si el monitor está activo.

```typescript
auth.isSessionMonitorActive(): boolean
```

#### `getBlockedRedirectUrl(error)`
Genera URL para la página de bloqueo según el código de error.

```typescript
auth.getBlockedRedirectUrl(error: AuthError): string
```

---

### Autorización

#### `hasRole(app, role)`
Verifica si el usuario tiene un rol específico en una app.

```typescript
auth.hasRole(app: string, role: string): boolean

// auth.hasRole('console', 'admin') → true/false
```

#### `getRoles(app)`
Retorna todos los roles del usuario en una app.

```typescript
auth.getRoles(app: string): string[]
```

#### `hasAccessToApp(app)`
Retorna `true` si el usuario tiene al menos un rol en la app.

```typescript
auth.hasAccessToApp(app: string): boolean
```

#### `getPermissions(forceRefresh?)`
Obtiene permisos granulares del plan (con caché).

```typescript
auth.getPermissions(forceRefresh = false): Promise<UserPermissions | null>
```

#### `hasModulePermission(module, action, appKey?)`
Verifica permiso específico.

```typescript
auth.hasModulePermission(module: string, action: string, appKey?: string): Promise<boolean>
```

#### `getPlanModules(appKey?)`
Obtiene módulos activos del plan.

```typescript
auth.getPlanModules(appKey?: string): Promise<string[] | null>
```

---

## useTGTAuth (React Hook)

```typescript
import { useTGTAuth } from '@tgtone/auth-sdk';

function App() {
  const {
    session,          // TGTSession | null
    loading,          // boolean
    logout,           // () => Promise<void>
    hasRole,          // (app, role) => boolean
    hasAccessToApp,   // (app) => boolean
    getRoles,         // (app) => string[]
    getPermissions,   // (forceRefresh?) => Promise<UserPermissions | null>
    hasModulePermission, // (module, action, appKey?) => Promise<boolean>
    getPlanModules,   // (appKey?) => Promise<string[] | null>
    clearPermissionsCache, // () => void
    tenantId,         // string | null
    getToken,         // () => string | null
    authClient,       // TGTAuthClient
    revokedError,     // AuthError | null (solo si showRevokedState=true)
    isSessionMonitorActive, // boolean
    startSessionMonitor,   // () => void
    stopSessionMonitor,    // () => void
    permissionsVersion,    // number
  } = useTGTAuth({
    identityUrl: '...',
    appDomain: window.location.host,
    appKey: 'console',
    enableSessionMonitor?: boolean, // default: true
    showRevokedState?: boolean,     // default: false
    ...TGTAuthConfig,
  });
}
```

### Manejo de estados

```tsx
if (loading) return <Spinner />;

if (revokedError) {
  // Sesión revocada (usuario eliminado, tenant suspendido, etc.)
  return <BlockedPage error={revokedError} />;
}

if (!session) {
  // Redirigiendo al login automáticamente
  return null;
}

return <Dashboard />;
```

---

## Interceptors HTTP

### Axios

```typescript
import { createAxiosInterceptor } from '@tgtone/auth-sdk';

const cleanup = createAxiosInterceptor(axiosInstance, authClient, {
  handleRevoked?: boolean;   // Redirigir a /blocked en 401 de revocación
  excludeUrls?: string[];    // URLs a excluir
  onRequest?: (config) => config;   // Hook antes de enviar
  onResponse?: (response) => response; // Hook después de recibir
});
```

### Fetch

```typescript
import { createAuthFetch } from '@tgtone/auth-sdk';

const authFetch = createAuthFetch(authClient, {
  handleRevoked?: boolean;
  excludeUrls?: string[];
});

// Uso igual que fetch nativo
const res = await authFetch('/api/users');
```

### handleAuthError

```typescript
import { handleAuthError } from '@tgtone/auth-sdk';

const error = handleAuthError(errorResponse, authClient);
// Retorna: AuthError | null
```

---

## isRevocationError

```typescript
import { isRevocationError, REVOCATION_ERROR_CODES } from '@tgtone/auth-sdk';

isRevocationError('USER_INACTIVE'); // true
isRevocationError('SOME_OTHER');    // false
```

### Códigos de error

| Código | Significado | Blocked type |
|--------|-------------|-------------|
| `USER_INACTIVE` | Usuario desactivado | `user` |
| `USER_NOT_FOUND` | Usuario eliminado | `user` |
| `TENANT_INACTIVE` | Tenant suspendido/eliminado | `tenant` |
| `SESSION_EXPIRED` | Sesión expiró por inactividad | `expired` |
| `ACCESS_REVOKED` | Acceso revocado a una app | `access` |
| `APP_SUBSCRIPTION_LOCKED` | Suscripción bloqueada | `subscription` |
| `TRIAL_EXPIRED` | Trial terminado | `trial` |

---

## Tipos

```typescript
interface TGTUser {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  tenantId: string;
  tenantName: string;
  roles: Record<string, string[]>;
}

interface TGTSession {
  user: TGTUser;
  tenantId: string;
  tenantName: string;
  expiresAt: Date;
}

interface AuthError {
  code: AuthErrorCode;
  message: string;
}

type AuthErrorCode =
  | 'USER_INACTIVE' | 'USER_NOT_FOUND'
  | 'TENANT_INACTIVE'
  | 'SESSION_EXPIRED'
  | 'ACCESS_REVOKED'
  | 'APP_SUBSCRIPTION_LOCKED'
  | 'TRIAL_EXPIRED';
```

### `getApplicationRoles(appId)`

Obtiene los roles disponibles para una aplicación desde el Core API.

```typescript
const roles = await authClient.getApplicationRoles('app-uuid-123');
// [ { id: 'r1', key: 'admin', name: 'Administrador', permissions: {...} }, ... ]
```

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `appId` | `string` | UUID de la aplicación |

**Errores:** `Error('appId es requerido')` si el parámetro está vacío. `Error('No hay sesión activa')` si no hay token JWT.

### `listUsers(tenantId)`

Lista usuarios de un tenant desde el Core API.

```typescript
const users = await authClient.listUsers('tenant-uuid-123');
// [ { userId: 'u1', email: '...', firstName: '...', lastName: '...', isActive: true, applications: [...] }, ... ]
```

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `tenantId` | `string` | ID del tenant |

**Errores:** `Error('tenantId es requerido')` si el parámetro está vacío. `Error('No hay sesión activa')` si no hay token JWT.
