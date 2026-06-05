# TGT Auth SDK - Quick Start para React

> Integración rápida de autenticación en proyectos React con el hook `useTGTAuth`

---

## Instalación

```bash
npm install @tgtone/auth-sdk
```

**Versión actual:** 1.4.4

---

## Setup en 2 Pasos

### 1. Envolver App con `useTGTAuth`

```tsx
// src/App.tsx
import { useTGTAuth } from '@tgtone/auth-sdk/react';

function App() {
  const { session, loading, logout, hasRole, revokedError } = useTGTAuth({
    identityUrl: import.meta.env.VITE_IDENTITY_URL || 'https://identity.tgtone.cl',
    appDomain: window.location.host,
    appKey: 'baco', // Requerido en dev (localhost, dev-baco.tgtone.cl, etc.)
    enableHeartbeat: true, // Default: true - detecta sesión revocada cada 5 min
    debug: import.meta.env.DEV,
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (revokedError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2>Acceso bloqueado</h2>
          <p>{revokedError.message}</p>
          <a href={import.meta.env.VITE_IDENTITY_URL}>Volver al login</a>
        </div>
      </div>
    );
  }

  if (!session) {
    return null; // Redirigiendo a login automáticamente
  }

  return (
    <div>
      <header className="flex justify-between items-center p-4">
        <h1>Mi App</h1>
        <div className="flex items-center gap-4">
          <span>{session.user.name}</span>
          <span className="text-sm text-gray-500">{session.tenantName}</span>
          <button onClick={logout}>Cerrar Sesión</button>
        </div>
      </header>

      {hasRole('baco', 'admin') && <AdminPanel />}

      <main>{/* Tu contenido */}</main>
    </div>
  );
}
```

### 2. Variables de Entorno

```env
# .env.local
VITE_IDENTITY_URL=https://identity.tgtone.cl
```

Eso es todo. El hook `useTGTAuth` maneja automáticamente:
- Verificación de sesión al montar
- Captura del token desde la URL (después del redirect SSO)
- Heartbeat para detectar sesión revocada
- Redirección a login si no hay sesión
- Limpieza del heartbeat al desmontar

---

## Configuración con `appKey`

El SDK extrae automáticamente la app key del dominio (`baco.tgtone.cl` -> `baco`). Pero en desarrollo necesitas especificarla manualmente:

```tsx
// En localhost o ambientes dev (dev-baco.tgtone.cl)
const { session } = useTGTAuth({
  identityUrl: 'https://identity.tgtone.cl',
  appDomain: window.location.host,
  appKey: 'baco', // Sin esto, en localhost retorna undefined
});

// En producción (baco.tgtone.cl) no es necesario
const { session } = useTGTAuth({
  identityUrl: 'https://identity.tgtone.cl',
  appDomain: window.location.host, // Extrae 'baco' automáticamente
});
```

---

## Propiedades de Sesión

```typescript
// Datos del usuario
session.user.email       // "user@empresa.cl"
session.user.name        // "Juan Pérez"
session.user.sub         // "uuid-user-123"

// Datos del tenant
session.tenantId         // "uuid-tenant-123"
session.tenantName       // "Mi Empresa"

// Roles - IMPORTANTE: están en user.roles, NO en session.roles
session.user.roles       // { console: ['owner'], baco: ['admin'] }

// Expiración
session.expiresAt        // Date object
```

---

## Verificar Roles

```tsx
function Dashboard() {
  const { hasRole, hasAccessToApp, getRoles } = useTGTAuth({
    identityUrl: 'https://identity.tgtone.cl',
    appDomain: window.location.host,
  });

  // Verificar un rol específico
  if (hasRole('console', 'admin')) {
    // Mostrar panel de admin
  }

  // Verificar acceso a una app
  if (hasAccessToApp('zenith')) {
    // Mostrar enlace a Zenith
  }

  // Obtener todos los roles en una app
  const roles = getRoles('console'); // ['owner', 'admin']
}
```

---

## Session Revocation

El SDK detecta automáticamente cuando un usuario/tenant es desactivado y maneja la sesión:

```tsx
const { session, revokedError } = useTGTAuth({
  identityUrl: 'https://identity.tgtone.cl',
  appDomain: 'baco.tgtone.cl',
  appKey: 'baco',
  enableHeartbeat: true, // Valida sesión cada 5 minutos
});

// revokedError es null normalmente
// Si el usuario es desactivado, se setea automáticamente:
if (revokedError) {
  // revokedError.code puede ser:
  // 'USER_INACTIVE' | 'USER_NOT_FOUND' | 'TENANT_INACTIVE'
  // 'APP_SUBSCRIPTION_LOCKED' | 'TRIAL_EXPIRED'
}
```

### Custom Revocation Handler

```tsx
const { session } = useTGTAuth({
  identityUrl: 'https://identity.tgtone.cl',
  appDomain: 'baco.tgtone.cl',
  showRevokedState: true, // No redirige automáticamente, setea revokedError
  onSessionRevoked: (error) => {
    // Log personalizado, analytics, etc.
    console.log('Sesión revocada:', error.code);
  },
});
```

---

## Interceptor Axios (para API calls)

```tsx
import { createAxiosInterceptor } from '@tgtone/auth-sdk/interceptor';
import { useTGTAuth } from '@tgtone/auth-sdk/react';

function App() {
  const { authClient, session } = useTGTAuth({
    identityUrl: 'https://identity.tgtone.cl',
    appDomain: 'baco.tgtone.cl',
  });

  useEffect(() => {
    if (!session) return;

    const api = axios.create({ baseURL: '/api' });
    const cleanup = createAxiosInterceptor(api, authClient, {
      handleRevoked: true,
      excludeUrls: ['/public/health'],
    });

    return cleanup;
  }, [session, authClient]);
}
```

---

## Verificación Silenciosa (Landing Pages)

Para páginas que no requieren autenticación obligatoria:

```tsx
import { TGTAuthClient } from '@tgtone/auth-sdk';

const auth = new TGTAuthClient({
  identityUrl: 'https://identity.tgtone.cl',
  appDomain: 'tgtone.cl',
});

// No redirige, solo retorna null si no hay sesión
const session = await auth.checkSessionSilent();

if (session) {
  showButton('Ir al Dashboard', '/dashboard');
} else {
  showButton('Iniciar Sesión', () => auth.redirectToLogin(window.location.href));
}
```

---

## Flujo de Autenticación

```
1. Usuario entra a tu app
   ↓
2. useTGTAuth() llama checkSession()
   ↓
3. No hay token → SDK redirige a identity.tgtone.cl/login
   ↓
4. Usuario hace login (+ MFA si está habilitado)
   ↓
5. Identity redirige: tu-app?token=eyJhbGci...
   ↓
6. SDK captura token de URL, guarda en localStorage, limpia URL
   ↓
7. Sesión válida → renderiza la app
```

---

## Testing sin Login

```typescript
// Guardar token manualmente en localStorage
localStorage.setItem('tgtone_auth_token', 'eyJhbGci...');
window.location.reload();

// Obtener token de prueba con curl:
// curl -X POST https://identity.tgtone.cl/api/v1/auth/login \
//   -H 'Content-Type: application/json' \
//   -d '{"email": "user@test.cl", "password": "Test123!"}'
```

---

## Referencia Completa

- **[API.md](./API.md)** - Referencia completa de todos los métodos y tipos
- **[INTEGRATION_EXAMPLES.md](./INTEGRATION_EXAMPLES.md)** - Ejemplos para Vue, Next.js, Angular
- **[MIGRATION_GUIDE.md](../MIGRATION_GUIDE.md)** - Migración entre versiones
- **[CHANGELOG.md](../CHANGELOG.md)** - Historial de cambios

---

**Versión:** 1.4.4
**Última actualización:** 2026-04-14
