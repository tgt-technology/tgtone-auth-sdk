# Arquitectura — @tgtone/auth-sdk

> Flujos de autenticación, WebSocket y session cache

---

## OAuth PKCE Flow

```
Browser (SPA)                     Backend Core (Elysia)
     │                                    │
     │  redirectToLogin()                 │
     │  ── authorize() ──────────────────▶│
     │  (genera PKCE challenge)           │
     │                                    │
     │  window.location.href              │
     │  ──── /login (SSR) ───────────────▶│
     │                                    │
     │  ◀── Login form HTML ─────────────│
     │                                    │
     │  Login form POST                   │
     │  ─────────────────────────────────▶│
     │                                    │
     │  302 redirect con ?code=           │
     │  ◀─────────────────────────────────│
     │                                    │
     │  SPA recibe ?code=                 │
     │  ── POST /token ──────────────────▶│
     │  (code + PKCE verifier)            │
     │  ◀── tokens ──────────────────────│
     │                                    │
     │  Guarda en localStorage            │
     │  Inicia session monitor            │
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

---

## Manejo de sesión revocada

### Detectado en:

1. **WebSocket** — mensaje `SESSION_REVOKED` / `ROLES_CHANGED` / `ACCESS_REVOKED` → reacción inmediata
2. **Refresh JWT** — refresh falla con 401 → ejecuta `onSessionRevoked`
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

### Cookies del backend (SSO auto-authorize)

El backend setea dos cookies HttpOnly en su dominio (dev-core.tgtone.cl / core.tgtone.cl):

| Cookie | TTL | Propósito |
|--------|-----|-----------|
| `tgtone_session` | 15 min | JWT access token para auto-authorize en GET /login |
| `tgtone_refresh` | 30 días | Refresh token para auto-authorize cuando `tgtone_session` expira |

**Flujo SSO (auto-authorize):**
1. App A redirige al browser a `core/login?client_id=...&redirect_uri=...&code_challenge=...`
2. Backend lee `tgtone_session` → si es válida, genera auth code y redirige de vuelta (sin mostrar login)
3. Si `tgtone_session` expiró (15 min), backend lee `tgtone_refresh` → valida en BD → si es válida, rota tokens, setea cookies frescas, genera auth code y redirige
4. Si ambas expiraron → muestra formulario de login

**Desde v4.2.0**, el SDK envía `credentials: 'include'` en los fetch de `_executeRefresh()`, `handleCallback()` y `exchangeAccessToken()`. Esto permite que el browser reciba y almacene las cookies `Set-Cookie` del backend cross-origin (requiere CORS con `credentials: true`, ya configurado en el backend).

**Grace period en rotación (v4.2.0):**
- `validateAndRotate` no borra la sesión vieja inmediatamente. La marca con `rotatedAt` y la borra después de 60s.
- Si dos tabs/apps hacen refresh simultáneo, la segunda no dispara `revokeAllSessions`.
- El campo `rotatedAt` en el modelo `Session` requiere migración `20260710000538_add_session_rotated_at`.

```
localStorage  → persiste entre pestañas y sesiones del browser
sessionStorage → muere al cerrar la pestaña
window.*      → muere al recargar la página
cookies       → HttpOnly, host-only del backend, enviadas en redirects físicos
```
