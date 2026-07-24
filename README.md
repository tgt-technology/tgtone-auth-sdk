# @tgtone/auth-sdk

SDK de autenticación centralizada para el ecosistema TGT One. OAuth PKCE + JWT + Session Cache via WebSocket.

```bash
npm install @tgtone/auth-sdk
```

---

## Uso básico

### React (hook)

```tsx
import { useTGTAuth } from '@tgtone/auth-sdk';

function App() {
  const { session, loading, logout, hasRole } = useTGTAuth({
    coreApiUrl: 'https://dev-core.tgtone.cl', // sin /api
    appDomain: window.location.host,
    appKey: 'console',
  });

  if (loading) return <Spinner />;
  if (!session) return null; // redirigiendo al login

  return (
    <div>
      <span>{session.user.name}</span>
      <button onClick={logout}>Cerrar sesión</button>
      {hasRole('console', 'admin') && <AdminPanel />}
    </div>
  );
}
```

### Sin framework (TGTAuthClient)

```typescript
import { TGTAuthClient } from '@tgtone/auth-sdk';

const auth = new TGTAuthClient({
  coreApiUrl: 'https://dev-core.tgtone.cl', // sin /api
  appDomain: window.location.host,
  appKey: 'console',
});

const session = await auth.checkSession();
if (session) {
  console.log('Usuario:', session.user.email);
}
```

---

## API rápida

| Método | Descripción |
|--------|-------------|
| `checkSession()` | Valida sesión, redirige a login si no hay |
| `checkSessionSilent()` | Valida sin redirigir |
| `redirectToLogin(url?)` | Redirige al login de Identity |
| `logout()` | Cierra sesión + redirige a login |
| `localLogout()` | Limpia sesión sin redirigir |
| `hasRole(app, role)` | Verifica rol del usuario |
| `hasAccessToApp(app)` | Verifica acceso a una app |
| `getToken()` | Obtiene JWT actual |
| `isRedirecting()` | `true` si está redirigiendo al login |
| `getBlockedRedirectUrl(error)` | URL de página bloqueada |
| `getApplicationRoles(appId)` | Obtiene roles de una aplicación desde el Core API |
| `listUsers(tenantId)` | Lista usuarios de un tenant desde el Core API |
| `startSessionMonitor()` | Inicia WS + refresh proactivo JWT |
| `stopSessionMonitor()` | Detiene WS + refresh |

### Gestión de usuarios (v4.3.0)

| Método | Descripción |
|--------|-------------|
| `inviteUser(data)` | Crear usuario + asignar roles + email de invitación |
| `updateUser(profileId, data)` | Actualizar perfil y/o roles de aplicación |
| `deleteUser(profileId)` | Desactivar usuario (soft delete + revocar sesiones) |
| `reactivateUser(profileId)` | Reactivar usuario eliminado |
| `resendInvitation(profileId)` | Reenviar email de invitación |
| `getUsersMap(tenantId)` | Mapa userId → nombre/email (solo activos) |
| `listUsers(tenantId)` | Lista usuarios de un tenant |
| `getApplicationRoles(appId)` | Roles disponibles de una app |

### Server-side (v4.3.0)

Para backends (Node/Bun), cron jobs y webhooks, existe `TGTAdminClient` — mismo API de gestión de usuarios, sin dependencias del DOM:

```typescript
import { TGTAdminClient } from '@tgtone/auth-sdk/server';

// Con JWT de admin reenviado, o con MAINTENANCE_API_KEY:
const admin = new TGTAdminClient({
  coreApiUrl: process.env.CORE_API_URL!,
  maintenanceKey: process.env.MAINTENANCE_API_KEY!, // o token: jwtDelRequest
});

const users = await admin.listUsers(tenantId);
```

Ver [`docs/USERS_MANAGEMENT.md`](./docs/USERS_MANAGEMENT.md) para patrones completos.

---

## Documentación

- [`docs/API.md`](./docs/API.md) — Referencia completa de API
- [`docs/USERS_MANAGEMENT.md`](./docs/USERS_MANAGEMENT.md) — Gestión de usuarios (frontend + backend)
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — OAuth PKCE, WS, session cache
- [`docs/INTEGRATION_EXAMPLES.md`](./docs/INTEGRATION_EXAMPLES.md) — Vue, Next.js, Angular
- [`CHANGELOG.md`](./CHANGELOG.md) — Historial de cambios

---

## ⚠️ Errores comunes (leer antes de integrar)

Los 5 problemas donde las apps nuevas más se caen:

### 1. `coreApiUrl` va SIN `/api`

```typescript
// ✅ Correcto — el SDK agrega los paths internamente
coreApiUrl: 'https://dev-core.tgtone.cl'
// ❌ Incorrecto (funciona por normalización, pero no es el estándar del ecosistema)
coreApiUrl: 'https://dev-core.tgtone.cl/api'
```

### 2. `sessionCacheUrl` NUNCA incluye `/ws`

El SDK concatena `/ws` automáticamente. Si lo pasas incluido, el WebSocket conecta a `wss://session.tgtone.cl/ws/ws` → 404.

```typescript
// ✅ Correcto
sessionCacheUrl: 'https://session.tgtone.cl'
// ❌ Incorrecto → doble /ws
sessionCacheUrl: 'wss://session.tgtone.cl/ws'
```

Síntoma en DevTools: `WebSocket connection to 'wss://session.tgtone.cl/ws/ws' failed`.

### 3. Una sola instancia de `TGTAuthClient` (patrón Proxy)

**NO** crear un singleton `new TGTAuthClient(...)` si también usas `useTGTAuth()` en el árbol de componentes. Cada instancia tiene su propio heartbeat y refresh; compiten por el mismo refresh token en localStorage → 401 intermitente → sesión destruida.

Patrón correcto: deja que `useTGTAuth()` cree la instancia y regístrala en un holder:

```typescript
// lib/auth-client.ts — holder, sin new TGTAuthClient()
let _client: TGTAuthClient | null = null;
export const authClient = new Proxy({} as TGTAuthClient, {
  get(_, prop) {
    if (!_client) throw new Error('AuthClient no inicializado');
    const v = _client[prop as keyof TGTAuthClient];
    return typeof v === 'function' ? v.bind(_client) : v;
  },
});
export function registerAuthClient(c: TGTAuthClient) { _client = c; }

// AuthContext.tsx — registra la instancia del hook
const { authClient: sdkClient } = useTGTAuth({...});
useEffect(() => { registerAuthClient(sdkClient); }, [sdkClient]);
```

### 4. React Strict Mode + OAuth = spinner infinito

Con `<StrictMode>` en `src/main.tsx`, el double-mount de desarrollo interrumpe el exchange OAuth: el primer login queda pegado en el spinner (F5 lo arregla, pero es mala señal).

**Fix**: quita `<StrictMode>` de `main.tsx` (el build de producción ya elimina el double-mount). El Console Frontend no lo usa por esta razón. Alternativa: agregar un recovery en tu `ProtectedApp` que haga `window.location.reload()` cuando `session=null`, `loading=false` y existe token en localStorage.

### 5. Pre-requisitos en el Core (BD)

El login muestra "Error de autenticación" genérico si falta alguno de estos en la tabla `applications`:

- `oauth_enabled = true`
- `oauth_redirect_uris` contiene la URL de la app (incluir las URLs de Cloud Run de cada ambiente: dev/qa/prod — cada una tiene un hash distinto)

```sql
SELECT key, oauth_enabled, oauth_redirect_uris FROM applications WHERE key = 'mi-app';
UPDATE applications SET oauth_enabled = true WHERE key = 'mi-app';
```

Adicional: nunca captures el token en una closure al pasarlo a otro SDK (`getToken: () => localStorage.getItem('tgtone_auth_token')` — leer siempre fresco, nunca `getToken: () => token`).

---

## Estructura del usuario

```typescript
interface TGTUser {
  sub: string;                          // ID del usuario
  email: string;
  emailVerified: boolean;
  name: string;
  tenantId: string;
  tenantName: string;
  roles: Record<string, string[]>;      // { console: ['admin'], baco: ['viewer'] }
}
```

---

## Migración desde v3 a v4

En v4, `identityUrl` pasó a llamarse `coreApiUrl`. El login, signup, auth, roles y usuarios están todos en el mismo Core API.

```diff
-  identityUrl: 'https://core.tgtone.cl',
+  coreApiUrl: 'https://core.tgtone.cl',
```

**Métodos nuevos:**

| Método | Reemplaza | Descripción |
|--------|-----------|-------------|
| `authClient.getApplicationRoles(appId)` | `core.applications.getRoles()` | Roles de una aplicación |
| `authClient.listUsers(tenantId)` | `core.users.list()` | Usuarios de un tenant |

Si estabas usando `@tgtone/core-sdk` solo para notificaciones, migra a `@tgtone/notifications-sdk`. Si lo usabas para auth, roles o usuarios, estos métodos ya están en `@tgtone/auth-sdk` v4.

## Licencia

Privado — TGT Group
