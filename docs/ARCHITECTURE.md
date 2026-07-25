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

Auto-authorize (SSO entre apps):
```
App A → core/login → backend lee cookie tgtone_session
  → si existe y válida → upsert Session (activeApps agrega app A)
  → genera auth code → 302 redirect a App A
  → sin mostrar login
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
     │                                │  publish sessionTerminated │
     │                                │                            │
     │  WS { type: 'session_terminated' }  │                      │
     │  ◀────────────────────────────  │                            │
     │                                │                            │
     │  handleSessionRevoked() o       │                            │
     │  redirectToLogin()              │                            │
```

### Eventos WS (v5.0.0)

| WS type | Cuándo | Quién recibe | Formato |
|---------|--------|-------------|---------|
| `session_terminated` | Logout desde cualquier app | Usuario específico (sendToUser) | `{ type, payload: { userId } }` |
| `roles_changed` | Roles modificados | Usuario específico | `{ type, payload: { appKey, roles } }` |
| `access_revoked` | Acceso a app removido o tenant eliminado | Usuario específico | `{ type, payload: { appKey, reason } }` — reason: `PERMISSION_REMOVED` \| `TENANT_DELETED` |

**Eliminados en v5.0.0:**
- `SESSION_REVOKED` → reemplazado por `session_terminated`
- `SESSION_REVOKED_BULK` → eliminado (el filtrado ahora es server-side con `sendToUser`, no `broadcastToAll`)

---

## Manejo de sesión revocada

### Detectado en:

1. **WebSocket** — mensaje `session_terminated` / `roles_changed` / `access_revoked` → reacción inmediata
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

---

## Logout

```
SDK logout():
  1. fetch(POST /api/v1/auth/logout, { credentials: 'include' })
     → backend borra la sesión única del usuario (Session.delete)
     → backend emite Set-Cookie con Max-Age=0 para tgtone_session y tgtone_refresh
     → backend publica session_terminated vía WS
  2. Limpia localStorage (access token, refresh token, permisos en caché)
  3. window.location.href = coreApiUrl + '/login'
     (navega al login del core — nunca queda el usuario en pantalla en blanco)
```

**Nota:** `localLogout()` limpia localStorage pero **no redirige** al core — usado por apps como Hub que manejan su propio login.

---

## Modelo de sesión (v5.0.0)

Desde v5.0.0 se usa **una sola sesión por usuario** con `activeApps: string[]`:

```prisma
model Session {
  id               String   @id @default(uuid())
  userId           String   @unique                     // ← UNA por usuario
  refreshTokenHash String   @unique                     // sin rotación
  activeApps       Json     @default("[]")              // ["console", "baco"]
  expiresAt        DateTime?
  deviceInfo, browser, os, ipAddress, ...
  user             User     @relation(fields: [userId], references: [id])
}
```

**Lo que se eliminó:**
- `tokenHash` → ahora `refreshTokenHash`
- `rotatedAt` → sin rotación, el mismo refresh token vale hasta expirar
- `applicationId` → las apps ahora se trackean en `activeApps`
- Circuit breaker, lock multi-tab, multi-tab sync (ya no son necesarios — una sesión no puede pisarse)

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
2. Backend lee `tgtone_session` → si válida, upsert Session (agrega app a `activeApps`), genera auth code y redirige (sin mostrar login)
3. Si `tgtone_session` expiró (15 min), backend lee `tgtone_refresh` → valida en BD → upsert Session, genera auth code y redirige
4. Si ambas expiraron → muestra formulario de login

**Sin rotación:** el refresh token no se rota. El mismo vale hasta expirar (30 días). El backend solo valida que exista en BD, que el usuario esté activo, y que el tenant esté activo.

```
localStorage  → persiste entre pestañas y sesiones del browser
sessionStorage → muere al cerrar la pestaña
window.*      → muere al recargar la página
cookies       → HttpOnly, host-only del backend, enviadas en redirects físicos
```
