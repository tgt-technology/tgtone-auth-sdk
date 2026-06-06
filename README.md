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
    identityUrl: 'https://dev-core.tgtone.cl',
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
  identityUrl: 'https://dev-core.tgtone.cl',
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
| `startSessionMonitor()` | Inicia heartbeat + WS |

---

## Documentación

- [`docs/API.md`](./docs/API.md) — Referencia completa de API
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — OAuth PKCE, WS, session cache
- [`docs/INTEGRATION_EXAMPLES.md`](./docs/INTEGRATION_EXAMPLES.md) — Vue, Next.js, Angular
- [`CHANGELOG.md`](./CHANGELOG.md) — Historial de cambios

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

## Licencia

Privado — TGT Group
