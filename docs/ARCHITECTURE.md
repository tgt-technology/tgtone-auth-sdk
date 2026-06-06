# Arquitectura — @tgtone/auth-sdk

> Flujos de autenticación, WebSocket y session cache

---

## OAuth PKCE Flow

```
Browser (SPA)                     Backend (Elysia)              Identity
     │                                │                            │
     │  redirectToLogin()             │                            │
     │  ── authorize() ──────────────▶│                            │
     │  (genera PKCE challenge)       │                            │
     │                                │                            │
     │  window.location.href          │                            │
     │  ────────────────────────────────────────────────────────▶  │
     │                                │                            │
     │                                │     /login (SSR)          │
     │                                │  ◀───────────────────────  │
     │                                │                            │
     │  Login form POST               │                            │
     │  ────────────────────────────────────────────────────────▶  │
     │                                │                            │
     │  302 redirect con ?code=       │                            │
     │  ◀────────────────────────────────────────────────────────  │
     │                                │                            │
     │  SPA recibe ?code=             │                            │
     │  ── POST /token ──────────────▶│                            │
     │  (code + PKCE verifier)        │  ── exchange ──▶           │
     │                                │  ◀── tokens ───            │
     │  ◀── tokens ───────────────────│                            │
     │                                │                            │
     │  Guarda en localStorage        │                            │
     │  Inicia session monitor        │                            │
```

### `isRedirecting()`

El flujo `authorize()` es asíncrono (tiene `await import('./pkce')`). Entre que se inicia y se ejecuta `window.location.href`, React puede renderizar con `loading=false` y `session=null`, causando una página en blanco.

El flag `isRedirecting()` se setea **antes** del primer `await` en `authorize()`, y también en `handleNoSession()` antes de llamar `onAuthFailure`. El hook `useTGTAuth` lo usa en el `finally` para no poner `loading=false` si la redirección está en progreso.

**Dónde se setea:**
- `authorize()` — antes de `await import('./pkce')`
- `handleNoSession()` — antes de `onAuthFailure()`
- `redirectToLogin()` — antes de llamar `authorize()`

---

## Session Cache WebSocket

```
Browser (auth-sdk)             Session Cache (Linode)          Backend (Elysia)
     │                                │                            │
     │  ── connect WS ──────────────▶  │                            │
     │  { type: 'auth', userId }       │                            │
     │                                │                            │
     │                                │                            │  POST /notify/logout
     │                                │  ◀────────────────────────  │
     │                                │  removeUserActive(userId)  │
     │                                │  publish 'user:revoked'    │
     │                                │                            │
     │  WS { type: 'SESSION_REVOKED',    │                            │
     │       payload: { userId,          │                            │
     │       reason:'logout' } }         │                            │
     │  ◀────────────────────────────  │                            │
     │                                │                            │
     │  handleSessionRevoked() o       │                            │
     │  redirectToLogin() (si logout)  │                            │
```

### Eventos WS

| WS type | Cuándo | Quién recibe | Formato |
|---------|--------|-------------|---------|
| `SESSION_REVOKED` | Logout desde otra app | Usuario específico | `{ type, payload: { userId, reason } }` |
| `ROLES_CHANGED` | Roles modificados | Usuario específico | `{ type, payload: { appKey, roles } }` |
| `ACCESS_REVOKED` | Acceso a app removido | Usuario específico | `{ type, payload: { appKey, reason } }` |
| `SESSION_REVOKED_BULK` | Tenant suspendido/eliminado | Broadcast a todos | `{ type, payload: { tenantId, reason } }` |

### Heartbeat directo

Cada 5 minutos el SDK envía `POST /session/heartbeat { userId }` directamente al Linode (sin pasar por backend Cloud Run). Evita el cold start del backend.

### REST fallback

Cada 60 segundos el SDK consulta `GET /session/check/:userId`. Si retorna `{ valid: false }`, intenta un refresh del token. Si falla, muestra sesión expirada.

---

## Manejo de sesión revocada

### Detectado en:

1. **WebSocket** — mensaje `session:revoked` → reacción inmediata
2. **Heartbeat** — refresh falla con 401 → ejecuta `onSessionRevoked`
3. **Interceptor HTTP** — cualquier request 401 con código de revocación → bloquea sesión
4. **checkSession()** — al cargar la app detecta token inválido

### Comportamiento por defecto:

```
handleSessionRevoked(error)
  → Limpia tokens localmente
  → Si hay onSessionRevoked callback, lo ejecuta
  → Sino, redirige a /blocked?type={...}&redirect={origin}
```

### Razón `logout` vs otros

Cuando el WS envía `SESSION_REVOKED` con `reason: 'logout'`, el SDK entiende que fue un logout voluntario desde otra app y redirige al login (sin blocked page). Para otros casos (user eliminado, tenant suspendido) muestra la blocked page.

---

## Almacenamiento

| Dato | Storage | Clave |
|------|---------|-------|
| JWT access token | `localStorage` | `tgtone_auth_token` |
| Refresh token | `localStorage` | `tgtone_refresh_token` |
| Temp token (MFA) | `localStorage` | `tgtone_temp_token` |
| PKCE code verifier | `sessionStorage` | `oauth_code_verifier` |
| Post-login redirect | `sessionStorage` | `tgtone_post_login_redirect` |
| OAuth exchange lock | `window.__oauth_exchange_lock` | en memoria (muere al recargar) |

```
localStorage  → persiste entre pestañas y sesiones del browser
sessionStorage → muere al cerrar la pestaña
window.*      → muere al recargar la página
```
