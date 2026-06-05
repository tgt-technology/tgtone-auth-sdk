# 🔐 TGT One Auth Client SDK

SDK para integrar autenticación JWT + Bearer Token en aplicaciones del ecosistema TGT One.

---

## 📦 Instalación

```bash
npm install @tgtone/auth-sdk
```

---

## 🚀 Quick Start

### Crear cuenta nueva (Signup)

```typescript
import { TGTAuthClient } from '@tgtone/auth-sdk';

const auth = new TGTAuthClient({
  identityUrl: 'https://identity.tgtone.cl',
  appDomain: window.location.hostname,
  appKey: 'baco', // Requerido en dev/localhost
  debug: true
});

// Signup - Crear nueva cuenta
const result = await auth.signup({
  email: 'juan@empresa.cl',
  password: 'MiPassword123!', // Opcional - si no se provee, se genera automática
  firstName: 'Juan',
  lastName: 'Pérez',
  tenantName: 'Mi Empresa'
});

console.log('Cuenta creada:', result.user.email);
```

### Iniciar sesión (Login)

```typescript
// Login - Iniciar sesión
const result = await auth.login({
  email: 'juan@empresa.cl',
  password: 'MiPassword123!'
});

// Si tiene MFA habilitado
if (result.requiresMfa) {
  const code = prompt('Ingresa código de Google Authenticator:');
  const session = await auth.verifyMfa(result.tempToken, code);
  console.log('Login con MFA exitoso');
} else {
  console.log('Login exitoso:', result.user.email);
}
```

### Verificar sesión existente

```typescript
// Verificar sesión (redirige automáticamente si no hay sesión)
const session = await auth.checkSession();
if (session) {
  console.log('Usuario:', session.user.email);
  console.log('Tenant:', session.tenantName);
  console.log('Roles:', session.user.roles);
  console.log('Expira:', session.expiresAt);
}
```

### Verificar sesión SIN redirigir (nuevo en v1.2.0)

```typescript
// Solo verifica si el usuario está logeado - NO redirige
const session = await auth.checkSessionSilent();

if (session) {
  console.log('Usuario logeado:', session.user.email);
  // Mostrar contenido privado
} else {
  console.log('Usuario no logeado');
  // Mostrar botón de login
}

// Verificar sin validar con backend (más rápido, solo valida JWT localmente)
const session = await auth.checkSessionSilent(false);
```

### Redirigir a login con URL de retorno personalizada

```typescript
// Configurar hosts permitidos para redirecciones
const auth = new TGTAuthClient({
  identityUrl: 'https://identity.tgtone.cl',
  appDomain: 'tgtone.cl',
  allowedRedirectHosts: ['tgtone.cl', 'www.tgtone.cl', 'app.tgtone.cl']
});

// Desde la página /precios, redirigir a login y volver después
const currentUrl = window.location.href; // https://tgtone.cl/precios
auth.redirectToLogin(currentUrl);

// Después del login, el usuario volverá a /precios
```

---

## 📋 API Principal

### **Autenticación**

#### `signup(data: SignupData): Promise<AuthResponse>`
Crea una nueva cuenta de usuario y tenant.

```typescript
const result = await auth.signup({
  email: 'user@empresa.cl',
  password: 'Pass123!', // Opcional
  firstName: 'María',
  lastName: 'García',
  tenantName: 'Empresa XYZ'
});

if (result.mustChangePassword) {
  // Mostrar formulario de cambio de contraseña
}
```

#### `login(data: LoginData): Promise<AuthResponse>`
Inicia sesión con email y contraseña.

```typescript
const result = await auth.login({
  email: 'user@empresa.cl',
  password: 'Pass123!'
});
```

#### `verifyMfa(tempToken: string, code: string): Promise<TGTSession>`
Verifica código MFA después de login (si el usuario tiene MFA habilitado).

```typescript
if (result.requiresMfa) {
  const session = await auth.verifyMfa(result.tempToken, '123456');
}
```

### **Sesión**

#### `checkSession(): Promise<TGTSession | null>`
Verifica sesión existente, valida JWT y hace request al backend. **Redirige automáticamente a login si no hay sesión válida.**

**Retorna:** `TGTSession` con `{ user, tenantId, tenantName, expiresAt }` o `null`.

**Uso:** Apps que requieren autenticación obligatoria (dashboards, consolas).

#### `checkSessionSilent(validateWithServer = true): Promise<TGTSession | null>` 🆕
Verifica sesión **SIN redirigir automáticamente**. Ideal para saber si el usuario está logeado sin forzar redirecciones.

**Parámetros:**
- `validateWithServer` (boolean): Si es `true`, valida con `/api/v1/auth/me`. Si es `false`, solo valida JWT localmente (más rápido).

**Retorna:** `TGTSession` o `null` si no hay sesión.

**Uso:** Landing pages, páginas públicas que muestran contenido diferente si el usuario está logeado.

```typescript
// Ejemplo: Mostrar "Ir al Dashboard" si está logeado, sino "Login"
const session = await auth.checkSessionSilent();
if (session) {
  showButton('Ir al Dashboard', '/dashboard');
} else {
  showButton('Iniciar Sesión', () => auth.redirectToLogin());
}
```

#### `getSession(): TGTSession | null`
Obtiene sesión completa en memoria (sin hacer request).

#### `getTenantId(): string | null`
Obtiene ID del tenant actual.

#### `getToken(): string | null` 🆕
Obtiene el token JWT actual (Bearer token). Útil para inyectar en headers de API calls.

#### `TGTAuthClient.getStoredToken(): string | null` 🆕 (v3.4.1)
**Método estático**. Obtiene el token JWT sin necesitar una instancia de `TGTAuthClient`. Ideal para HTTP clients que se inicializan a nivel módulo (antes de que React renderice el `AuthContext`).

```typescript
import { TGTAuthClient } from '@tgtone/auth-sdk';

// ApiClient inicializado a nivel módulo
const apiClient = new ApiClient({
  getToken: () => TGTAuthClient.getStoredToken(),
});
```

#### `redirectToLogin(redirectUrl?: string): void` 🆕
Redirige al login del Identity Provider.

**Parámetros:**
- `redirectUrl` (string, opcional): URL completa a la que redirigir después del login. Solo funciona si el host está en `allowedRedirectHosts`.

**Ejemplo:**
```typescript
// Redirigir a login y volver a la página actual
auth.redirectToLogin(window.location.href);
```

#### `logout(): Promise<void>`
Cierra sesión y limpia localStorage.

#### `localLogout(): Promise<void>` 🆕
Cierra sesión **sin redirigir al Identity Provider**. Limpia tokens, sesión y caché de permisos localmente.

**Caso de uso:** Apps con acceso restringido a creadores (ej: Hub, que solo permite usuarios @tgtone.cl / @tgtgroup.cl). Estas apps tienen su propia página `/login` y manejan la redirección manualmente, evitando el flujo SSO estándar.

```typescript
// En una app con acceso solo-creadores:
const session = await authClient.checkSessionSilent();
if (session && !isAllowedEmail(session.user?.email)) {
  await authClient.localLogout();
  window.location.href = '/login'; // Redirigir a login propio
}
```

#### `isRedirectAllowed(redirectUrl: string): boolean` 🆕
Verifica si una URL de redirección está permitida según `allowedRedirectHosts`.

**Ejemplo:**
```typescript
const url = 'https://tgtone.cl/precios';
if (auth.isRedirectAllowed(url)) {
  auth.redirectToLogin(url);
}
```

### **Autorización**

#### `hasRole(app: string, role: string): boolean`
Verifica si el usuario tiene un rol específico en una app.

```typescript
if (auth.hasRole('console', 'admin')) {
  // Mostrar admin panel
}
```

#### `getRoles(app: string): string[]`
Obtiene todos los roles del usuario en una app.

#### `hasAccessToApp(app: string): boolean`
Verifica si el usuario tiene acceso a una app.

---

## 🚫 Session Revocation & Access Blocking (v1.3.0+, actualizado v1.4.0)

El SDK detecta automáticamente cuando un usuario/tenant es eliminado/desactivado, o cuando una suscripción es bloqueada/trial expirado, y cierra la sesión.

### Protección en 2 capas

| Capa | Dónde | Qué hace |
|------|-------|----------|
| **Backend (AuthGuard)** | Todos los endpoints API | Valida estado de usuario y tenant en cada request (con caché de 30s). Retorna 401 con código de error. |
| **Frontend (SDK)** | `checkSession()` + Heartbeat + Interceptors | Detecta errores 401, limpia token, redirige a `/blocked` o ejecuta callback personalizado. |

```
Usuario eliminado en Console
        │
        ▼
Backend AuthGuard → DB lookup → user.deletedAt? → 401 { code: 'USER_INACTIVE' }
        │
        ├── Si la app hace request API → Interceptor Axios/Fetch detecta 401 → redirect
        └── Si no hay requests → Heartbeat (cada 5 min) detecta 401 → redirect
```

### Habilitar en React

```tsx
import { useTGTAuth } from '@tgtone/auth-sdk/react';

function App() {
  const { session, loading, revokedError } = useTGTAuth({
    identityUrl: 'https://identity.tgtone.cl',
    appDomain: 'zenith.tgtone.cl',
    enableHeartbeat: true, // Default: true
  });

  if (revokedError) {
    // Sesión fue revocada - redirigiendo a /blocked
    return null;
  }
  
  // ...
}
```

### Con Interceptor Axios

```typescript
import { createAxiosInterceptor } from '@tgtone/auth-sdk/interceptor';

const api = axios.create({ baseURL: '/api' });
createAxiosInterceptor(api, authClient, {
  handleRevoked: true,
  excludeUrls: ['/public/health'],
});
```

### Con Interceptor Fetch

```typescript
import { createAuthFetch } from '@tgtone/auth-sdk/interceptor';

const authFetch = createAuthFetch(authClient, {
  handleRevoked: true,
  excludeUrls: ['/public/'],
});

// Uso igual que fetch nativo — inyecta Authorization header automáticamente
const response = await authFetch('/api/users');
const data = await response.json();
```

### Verificar errores manualmente

```typescript
import { isRevocationError } from '@tgtone/auth-sdk';

// En tu manejo de errores personalizado
try {
  await api.call();
} catch (error) {
  const code = error.response?.data?.code;
  if (code && isRevocationError(code)) {
    // Sesión revocada: usuario eliminado, tenant suspendido,
    // suscripción bloqueada o trial expirado
    // El SDK ya maneja la redirección si usas los interceptors
    // Pero puedes agregar lógica extra aquí (analytics, logging, etc.)
    console.log('Acceso bloqueado:', code);
  }
}
```

### Nuevos métodos

```typescript
// Control manual del heartbeat
authClient.startHeartbeat();
authClient.stopHeartbeat();
authClient.isHeartbeatActive();

// URL de redirección para sesión revocada
authClient.getBlockedRedirectUrl(error);
```

### Códigos de error

| Código | Descripción | Redirect |
|--------|-------------|----------|
| `USER_INACTIVE` | Usuario desactivado | `/blocked?type=user` |
| `USER_NOT_FOUND` | Usuario eliminado | `/blocked?type=user` |
| `TENANT_INACTIVE` | Empresa suspendida | `/blocked?type=tenant` |
| `APP_SUBSCRIPTION_LOCKED` | Suscripción bloqueada | `/blocked?type=subscription` |
| `TRIAL_EXPIRED` | Trial expirado | `/blocked?type=trial` |

Ver **[MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)** para instrucciones detalladas.

---

## 🔄 Cómo Funciona

### Protección de usuario activo (v1.4.0)

El backend valida el estado del usuario y tenant en **cada request API**, no solo en `/auth/me`:

1. **AuthGuard con caché**: Todos los endpoints usan un guard que verifica `user.isActive`, `user.deletedAt` y `tenant.isActive`
2. **Caché de 30s**: Los resultados se cachean en memoria para evitar DB lookups repetidos (ideal para Cloud Run)
3. **Error codes**: Si el usuario/tenant no es válido, retorna 401 con código estructurado (`USER_INACTIVE`, `TENANT_INACTIVE`, etc.)

Esto significa que un usuario eliminado o tenant suspendido **no puede hacer ningún request API**, incluso entre heartbeats.

### Flujo estándar (con `checkSession()`)

1. Usuario visita tu app
2. `checkSession()` no encuentra token → redirige a Identity
3. Usuario hace login en Identity
4. Identity redirige a `tu-app?token=eyJhbGci...`
5. SDK lee token de URL y guarda en localStorage
6. SDK valida token con `Authorization: Bearer ...`
7. Retorna usuario

### Flujo sin redirección automática (con `checkSessionSilent()`) 🆕

1. Usuario visita tu landing page
2. `checkSessionSilent()` verifica si hay token válido
3. Si hay sesión: muestra contenido personalizado (ej: "Ir al Dashboard")
4. Si NO hay sesión: muestra botón de login
5. Usuario hace click en login → `redirectToLogin(window.location.href)`
6. Después del login, vuelve a la misma página

**Caso de uso:** Landing pages, páginas de precios, documentación pública que adapta contenido según si el usuario está logeado.

---

## Documentación Completa

- **[docs/QUICKSTART_REACT.md](./docs/QUICKSTART_REACT.md)** - Quick Start para React
- **[docs/API.md](./docs/API.md)** - Referencia completa de API
- **[docs/INTEGRATION_EXAMPLES.md](./docs/INTEGRATION_EXAMPLES.md)** - Ejemplos para otros frameworks (Vue, Next, Angular)
- **[CHANGELOG.md](./CHANGELOG.md)** - Historial de cambios
- **[MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)** - Guía de migración

---

## 🧪 Testing Rápido

```typescript
// 1. Obtener token con curl
// curl -X POST https://identity-backend.run.app/api/v1/auth/login \
//   -d '{"email": "user@tgtone.cl", "password": "pass"}'

// 2. Guardar manualmente
localStorage.setItem('tgtone_auth_token', 'eyJhbGci...');

// 3. Usar
const user = await auth.checkSession();
```

---

## 👤 Estructura del Usuario

```typescript
interface TGTUser {
  sub: string;               // ID único del usuario
  email: string;
  emailVerified: boolean;
  name: string;
  tenantId: string;
  tenantName: string;
  roles: Record<string, string[]>; // { console: ['owner'], zenith: ['admin'] }
}

// ⚠️ Los roles están en USER, no en session directamente
// ✅ Correcto: session.user.roles
// ❌ Incorrecto: session.roles (no existe)
```

---

## ⚙️ Configuración

```typescript
interface TGTAuthConfig {
  identityUrl: string;           // URL del backend Identity
  appDomain: string;             // Dominio de tu app
  appKey?: string;               // Key de la app (ej: 'baco'). Necesario en dev/localhost
  allowedRedirectHosts?: string[]; // Hosts permitidos para redirecciones (opcional)
  onAuthSuccess?: (session: TGTSession) => void;
  onAuthFailure?: (error?: AuthError) => void; // Si se provee, NO redirige automáticamente al login (v1.4.0)
  onSessionRevoked?: (error: AuthError) => void; // Callback para sesión revocada
  heartbeatIntervalMs?: number;  // Intervalo de validación de sesión (default: 5 min)
  debug?: boolean;
}
```

### Ejemplo completo

```typescript
const auth = new TGTAuthClient({
  identityUrl: 'https://identity.tgtone.cl',
  appDomain: 'tgtone.cl',
  
  // Permitir redirecciones a estos dominios
  allowedRedirectHosts: [
    'tgtone.cl',
    'www.tgtone.cl',
    'app.tgtone.cl',
    'landing.tgtone.cl'
  ],
  
  // Callbacks opcionales
  onAuthSuccess: (session) => {
    console.log('Usuario autenticado:', session.user.email);
    // Iniciar heartbeat para detectar sesión revocada
    auth.startHeartbeat();
  },
  
  onAuthFailure: (error) => {
    console.log('Sin sesión:', error?.message);
    // ⚠️ Si defines este callback, el SDK NO redirige automáticamente.
    // Debes manejar la redirección manualmente si la necesitas:
    // window.location.href = '/login';
  },
  
  // 🆕 Manejar sesión revocada (usuario/tenant eliminado)
  onSessionRevoked: (error) => {
    console.log('Sesión revocada:', error.code, error.message);
    // Opcional: analytics, logging, etc.
    // Si no se define, redirige automáticamente a /blocked
  },
  
  // 🆕 Validar sesión cada 5 minutos (default)
  heartbeatIntervalMs: 5 * 60 * 1000, // 5 minutos
  // Para deshabilitar: heartbeatIntervalMs: 0
  
  debug: true // Logs en consola para desarrollo
});
```

---

## � Flujo SSO y Redirecciones

El SDK está diseñado para manejar el flujo de Single Sign-On (SSO) de forma automática.

1. **Redirección al Identity**: Usa `auth.redirectToLogin()` para enviar al usuario al portal central de Identity.
2. **Retorno con Token**: Tras el login exitoso, Identity redirige de vuelta a tu app con un parámetro `?token=...` en la URL.
3. **Captura Automática**: Al llamar a `auth.checkSession()`, el SDK detecta el token en la URL, lo guarda en `localStorage` y limpia la URL.

### ⚠️ Nota Crítica para SPAs (React/Vue/etc)

En aplicaciones con enrutamiento en el cliente (como React Router), es vital **bloquear el renderizado de las rutas** mientras el SDK está verificando la sesión inicial.

Si el Router se monta y detecta una ruta protegida antes de que `checkSession()` termine, podría redirigir al usuario a `/login`, limpiando los parámetros de la URL y causando que el SDK pierda el token que venía desde Identity.

**Solución recomendada:**
```tsx
if (loading) return <LoadingSpinner />;
return <AppRouter />;
```

---

## �🔐 Seguridad

- **Token storage**: localStorage (`tgtone_auth_token`)
- **Transport**: Authorization header con Bearer token
- **Validation**: Backend valida JWT signature
- **No cookies**: Todo con Bearer tokens

---

**Versión:** 3.1.0  
**Ultima actualizacion:** 2026-05-26

## Imports

El SDK soporta imports modulares vía [package exports](https://nodejs.org/api/packages.html#exports):

```typescript
// Core client + tipos
import { TGTAuthClient } from '@tgtone/auth-sdk';

// React hook
import { useTGTAuth } from '@tgtone/auth-sdk/react';

// Axios/Fetch interceptors
import { createAxiosInterceptor, createAuthFetch } from '@tgtone/auth-sdk/interceptor';
```

## Changelog

Ver **[CHANGELOG.md](./CHANGELOG.md)** para el historial completo de cambios.
