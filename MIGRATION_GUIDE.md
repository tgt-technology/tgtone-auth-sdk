# Guía de Migración

## v1.x → v2.0.0

### Breaking Change: TGTUser snake_case eliminados

Los campos snake_case de `TGTUser` fueron eliminados. Solo camelCase:

| Antes (v1.x) | Ahora (v2.0) |
|---------------|---------------|
| `user.email_verified` | `user.emailVerified` |
| `user.tenant_id` | `user.tenantId` |
| `user.tenant_name` | `user.tenantName` |

### Migración rápida

Buscar y reemplazar en tu proyecto:

```bash
# Buscar usos
grep -rn '\.tenant_id\|\.tenant_name\|\.email_verified' src/

# Reemplazar
# .tenant_id     → .tenantId
# .tenant_name   → .tenantName
# .email_verified → .emailVerified
```

### Nota importante

El JWT payload del backend **sigue usando snake_case**. Si tu app decodifica JWT manualmente (`JSON.parse(atob(...))`), esos campos no cambian — sigue usando `tenant_id`, `tenant_name`, `email_verified` para leer el payload crudo. Solo la interfaz `TGTUser` del SDK cambió.

---

## v1.3.0 → v1.4.2

## Resumen

El SDK detecta automáticamente cuando un usuario/tenant es eliminado/desactivado, o cuando una suscripción es bloqueada/trial expirado, y cierra la sesión. A partir de v1.4.0, el backend también valida el estado del usuario en **todos los endpoints API** (no solo `/auth/me`).

## Cambios Principales

### 1. Protección completa en backend (v1.4.0)
- El AuthGuard del backend ahora valida `user.isActive`, `user.deletedAt` y `tenant.isActive` en **todos los endpoints**
- Caché en memoria de 30s para evitar DB lookups repetidos (compatible con Cloud Run)
- Un usuario eliminado no puede hacer ningún request API, incluso entre heartbeats

### 2. Heartbeat (Validación Periódica)
- El SDK valida la sesión cada **5 minutos** por defecto
- Si el backend rechaza la sesión, se ejecuta el callback `onSessionRevoked`
- Configurable con `heartbeatIntervalMs`

### 2b. checkSession() (v1.4.2)
- `checkSession()` ahora detecta errores de revocación al cargar la app
- Si el backend retorna 401 con un código de revocación (`APP_SUBSCRIPTION_LOCKED`, etc.), redirige a `/blocked` en vez de `/login`
- Antes de v1.4.2, `checkSession()` siempre redirigía a `/login` sin importar el tipo de error

### 3. Interceptor HTTP
- Módulo para capturar errores 401 en Axios y Fetch
- Maneja automáticamente errores de sesión revocada

### 4. Nuevos códigos de error detectados (v1.4.0)
- `APP_SUBSCRIPTION_LOCKED`: Suscripción bloqueada por admin
- `TRIAL_EXPIRED`: Período de prueba expirado
- Antes solo se detectaban `USER_INACTIVE`, `USER_NOT_FOUND`, `TENANT_INACTIVE`

### 5. `onAuthFailure` cambio de comportamiento (v1.4.0)
- **Antes**: Si se proporcionaba `onAuthFailure`, el SDK SIEMPRE redirigía al login después de ejecutar el callback
- **Ahora**: Si se proporciona `onAuthFailure`, el SDK NO redirige automáticamente. Debes manejar la redirección manualmente si la necesitas

---

## Migración por Tipo de App

### Apps React (Console, Hub, Baco, Zenith)

#### Opción A: Usando el Hook (Recomendado)

```tsx
import { useTGTAuth } from '@tgtone/auth-sdk';

function App() {
  const { session, loading, logout, revokedError } = useTGTAuth({
    identityUrl: 'https://identity.tgtone.cl',
    appDomain: 'zenith.tgtone.cl',
    enableHeartbeat: true, // Default: true - detecta usuario eliminado cada 5 min
  });

  if (revokedError) {
    // Sesión fue revocada (usuario eliminado, tenant suspendido, suscripción bloqueada, etc.)
    // El SDK ya redirige a /blocked automáticamente
    return null;
  }

  // ...
}
```

#### Opción B: Con Interceptor Axios

```tsx
import axios from 'axios';
import { TGTAuthClient } from '@tgtone/auth-sdk';
import { createAxiosInterceptor } from '@tgtone/auth-sdk/interceptor';

const authClient = new TGTAuthClient({
  identityUrl: 'https://identity.tgtone.cl',
  appDomain: 'zenith.tgtone.cl',
  heartbeatIntervalMs: 5 * 60 * 1000,
  onSessionRevoked: (error) => {
    const blockedUrl = authClient.getBlockedRedirectUrl(error);
    window.location.href = blockedUrl;
  },
});

const api = axios.create({ baseURL: '/api' });

createAxiosInterceptor(api, authClient, {
  handleRevoked: true,
  excludeUrls: ['/public/health'],
});

authClient.startHeartbeat();
```

#### Opción C: Con Interceptor Fetch (nuevo en docs)

```tsx
import { TGTAuthClient } from '@tgtone/auth-sdk';
import { createAuthFetch } from '@tgtone/auth-sdk/interceptor';

const authClient = new TGTAuthClient({
  identityUrl: 'https://identity.tgtone.cl',
  appDomain: 'zenith.tgtone.cl',
});

const authFetch = createAuthFetch(authClient, {
  handleRevoked: true,
  excludeUrls: ['/public/'],
});

// Uso igual que fetch nativo — inyecta Authorization header automáticamente
const response = await authFetch('/api/users');
```

### Landing (sin redirect automático)

```tsx
import { useTGTAuth } from '@tgtone/auth-sdk';

function LandingApp() {
  const { session, loading, revokedError } = useTGTAuth({
    identityUrl: 'https://identity.tgtone.cl',
    appDomain: 'tgtone.cl',
    showRevokedState: true, // No redirigir, mostrar estado en UI
  });

  if (loading) return <Spinner />;

  if (revokedError) {
    return (
      <RevokedSessionPage
        error={revokedError}
        onContactSupport={() => window.open('mailto:soporte@tgtone.cl')}
      />
    );
  }

  if (!session) return <PublicLanding />;

  return <PrivateContent user={session.user} />;
}
```

### Apps sin React (vanilla JS/TS)

```typescript
import { TGTAuthClient, isRevocationError } from '@tgtone/auth-sdk';

const authClient = new TGTAuthClient({
  identityUrl: 'https://identity.tgtone.cl',
  appDomain: 'omnisales.tgtone.cl',

  onSessionRevoked: (error) => {
    if (isRevocationError(error.code)) {
      console.log('Sesión revocada:', error.code);
      window.location.href = authClient.getBlockedRedirectUrl(error);
    }
  },

  heartbeatIntervalMs: 5 * 60 * 1000,
});

// Verificar sesión al iniciar
const session = await authClient.checkSession();
if (session) {
  authClient.startHeartbeat();
}
```

---

## API Reference

### Códigos de error

| Código | Descripción | Redirect | Detectado desde |
|--------|-------------|----------|-----------------|
| `USER_INACTIVE` | Usuario desactivado | `/blocked?type=user` | v1.3.0 |
| `USER_NOT_FOUND` | Usuario eliminado | `/blocked?type=user` | v1.3.0 |
| `TENANT_INACTIVE` | Empresa suspendida | `/blocked?type=tenant` | v1.3.0 |
| `APP_SUBSCRIPTION_LOCKED` | Suscripción bloqueada | `/blocked?type=subscription` | v1.4.0 |
| `TRIAL_EXPIRED` | Trial expirado | `/blocked?type=trial` | v1.4.0 |

### `isRevocationError(code: AuthErrorCode): boolean`

Verifica si un código de error indica que la sesión debe ser bloqueada. Retorna `true` para los 5 códigos anteriores.

```typescript
import { isRevocationError } from '@tgtone/auth-sdk';

if (isRevocationError(error.code)) {
  // Sesión revocada o acceso bloqueado
}
```

### Configuración completa

```typescript
interface TGTAuthConfig {
  identityUrl: string;
  appDomain: string;
  allowedRedirectHosts?: string[];
  onAuthSuccess?: (session: TGTSession) => void;
  onAuthFailure?: (error?: AuthError) => void;       // ⚠️ Si se provee, NO redirige (v1.4.0)
  onSessionRevoked?: (error: AuthError) => void;     // Callback para sesión revocada
  heartbeatIntervalMs?: number;                        // Default: 300000 (5 min). 0 = deshabilitado
  debug?: boolean;
}
```

---

## Flujo Completo

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Usuario/Tenant eliminado o suscripción bloqueada          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Backend (AuthGuard con caché 30s) rechaza TODOS los       │
│    requests con:                                              │
│    - USER_INACTIVE / USER_NOT_FOUND                          │
│    - TENANT_INACTIVE                                         │
│    - APP_SUBSCRIPTION_LOCKED / TRIAL_EXPIRED                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Frontend detecta error 401:                               │
│    a) checkSession() (al cargar la app)                      │
│    b) Interceptor HTTP (en cada request API)                 │
│    c) Heartbeat SDK (cada 5 min)                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Acción automática:                                        │
│    - Limpiar token local                                     │
│    - Ejecutar onSessionRevoked O redirect a /blocked         │
└─────────────────────────────────────────────────────────────┘
```

---

## Checklist de Migración

- [ ] Actualizar SDK a `@tgtone/auth-sdk@^1.4.2`
- [ ] Verificar que `enableHeartbeat` está habilitado (default: true)
- [ ] Si usas `onAuthFailure`, agregar redirección manual (comportamiento cambió en v1.4.0)
- [ ] Agregar interceptor HTTP si usas Axios o Fetch
- [ ] Agregar `isRevocationError` para manejo manual de errores si es necesario
- [ ] Probar eliminando un usuario y verificando que se cierra sesión

---

## Preguntas Frecuentes

### ¿El heartbeat afecta el rendimiento?
No, es una petición ligera cada 5 minutos. Puedes ajustar el intervalo o deshabilitarlo con `heartbeatIntervalMs: 0`.

### ¿Qué pasa si el backend está offline?
El heartbeat ignora errores de red. Solo actúa si el backend responde con un error de autenticación.

### ¿Puedo personalizar el comportamiento?
Sí, usa `onSessionRevoked` para manejar manualmente la revocación:

```typescript
const authClient = new TGTAuthClient({
  onSessionRevoked: (error) => {
    analytics.track('session_revoked', { code: error.code });
    const blockedUrl = authClient.getBlockedRedirectUrl(error);
    window.location.href = blockedUrl;
  },
});
```

### ¿`onAuthFailure` cambió en v1.4.0?
Sí. Antes siempre redirigía al login después de ejecutar el callback. Ahora, si proporcionas `onAuthFailure`, el SDK NO redirige automáticamente. Debes manejar la redirección manualmente:

```typescript
const authClient = new TGTAuthClient({
  onAuthFailure: (error) => {
    // Manejar sin sesión (mostrar UI, logging, etc.)
    // ⚠️ Ya NO redirige automáticamente - debes hacerlo manualmente:
    window.location.href = '/login';
  },
});
```

---

## Soporte

Para dudas o problemas, contactar a: **soporte@tgtone.cl**
