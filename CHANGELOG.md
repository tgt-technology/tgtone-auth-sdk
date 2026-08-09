# Changelog - @tgtone/auth-sdk

## 5.1.1 (2026-08-09)

### Fixed — Device ID compartido entre apps del mismo browser (D8)

**Corrección**: en 5.1.0 el deviceId se guardaba solo en `localStorage['tgtone_device_id']` (per-dominio). Esto causaba que cada app de distinto subdominio (dev-console vs dev-licita) generara SU deviceId → **sesiones separadas** y el logout en una app NO cerraba las demás.

**Fix**: cuando el core redirige de vuelta a la app en el flujo OAuth, lo hace con `?device_id=<uuid>` (el core es la fuente de verdad del deviceId, mantenido en cookie `tgtone_device`). El SDK:

- En `handleCallback`, si la URL trae `device_id`, lo adopta como `deviceId` y lo guarda en localStorage (como cache del valor del core).
- Así todas las apps del MISMO browser reciben el MISMO deviceId del core → comparten una sola sesión (`activeApps` se acumula) y el logout global cierra todo.

**Requiere**: backend core con la cookie `tgtone_device` y la inyección `?device_id=` (ver change OpenSpec `session-per-device-model` D8).

## 5.1.0 (2026-08-08)

### Added — Device ID (sesión por browser-dispositivo)

**Nuevo**: el SDK ahora genera y gestiona un identificador de dispositivo (`deviceId`) para habilitar el modelo de **una sesión por browser-dispositivo** (alineado con el backend core `session-per-device`).

- **`getDeviceId(): string | null`** (público) — devuelve el deviceId de este browser/dispositivo, o `null` si localStorage no está disponible.
- **Generación automática**: en el constructor se genera un `crypto.randomUUID()` la primera vez y se persiste en `localStorage['tgtone_device_id']`. Se reutiliza en recargas y nuevas instancias del mismo browser.
- **Header `X-Device-Id`**: se envía en todas las llamadas de autenticación — login, signup, token exchange (OAuth callback), exchange, y refresh. El backend lo usa para crear/validar la sesión correcta.

Este es un cambio **aditivo y retro-compatible**: las apps que no o leen ni envían el header siguen funcionando (el backend tiene fallback legacy). El deviceId permite que dos browsers del mismo usuario tengan sesiones independientes, y que el SSO entre apps del mismo browser comparta una única sesión.

## 5.0.0 (2026-07-24)

### Changed (BREAKING — modelo de sesión única)

**Arquitectura**: se reemplazó el modelo de "N sesiones por usuario (una por app/refresh rotation)" por **una sola sesión por usuario** con campo `activeApps: string[]` (JSON) que registra en qué aplicaciones está logueado.

Eliminados:
- **Circuit breaker** (`AUTH_LOOP_DETECTED`, `_incrAuthCycle`, `_resetAuthCycles`) — ya no es necesario. Sin sesiones fantasma no hay loop posible.
- **Lock multi-tab** (`_acquireFlowLock`, `_releaseFlowLock`, `_waitForFlowCompletion`) — una sola sesión no puede pisarse entre pestañas.
- **Multi-tab sync** (`_initMultiTabSync`, `_broadcastChannel`, `_storageHandler`) — sin rotación de refresh token no hay nada que sincronizar.
- **WS events**: simplificados de 4 a 3 tipos: `access_revoked`, `roles_changed`, `session_terminated`.

Mantenido:
- `credentials: 'include'` en `logout()` y `localLogout()`.
- Heartbeat / session monitor.

### Notes
- **Major bump** (4.4.0 → 5.0.0): cambios internos en el modelo de sesión y eventos WS. Sin breaking en la API pública de uso (login, logout, checkSession, hasRole, etc.).
- Requiere console backend v1.35.0+ con migración Prisma `single_session_model`.
- Tests: 165 pass / 2 skip (7 suites).

## 4.4.0 (2026-07-24)

### Fixed
- **Loop infinito de autenticación SSO** (`fix-auth-sso-loop`): tras un logout, el siguiente login podía entrar en un ciclo infinito de redirects app ↔ core (~2.5s/ciclo) creando decenas de sesiones fantasma en BD. Reproducido en Firefox, Edge y Chrome. Tres causas combinadas, tres fixes:
  1. **Logout no borraba las cookies SSO del core**: `logout()` y `localLogout()` hacían `fetch(POST /logout)` cross-origin **sin `credentials: 'include'`** → el navegador descartaba el `Set-Cookie` que borra `tgtone_session`/`tgtone_refresh`. Ahora ambos métodos envían `credentials: 'include'` y el logout cierra la sesión SSO de verdad.
  2. **Auto-authorize habilitado por sesiones ajenas** (fix en console backend): `GET /login` contaba TODAS las sesiones vivas del usuario sin filtrar por aplicación ni excluir rotadas → cualquier sesión fantasma (30d TTL) reactivaba el flujo OAuth sin pedir password. Ahora el conteo filtra por `applicationId` del `client_id` y excluye sesiones con `rotatedAt`.
  3. **Ping-pong de refresh tokens entre pestañas**: dos pestañas del mismo origen intercambiaban codes en paralelo y se pisaban el `tgtone_refresh_token` en localStorage, gatillando redirects mutuos infinitos.

### Added
- **Lock de flujo OAuth multi-pestaña** (`tgtone_oauth_flow_lock` en localStorage, TTL 30s): solo una pestaña ejecuta `authorize()`/callback PKCE; las demás esperan (poll 250ms, máx 15s) y adoptan la sesión resultante. El callback solo se ejecuta en la pestaña dueña del `code_verifier`; pestañas ajenas limpian el `?code=` de la URL y esperan.
- **Circuit breaker de ciclos de auth**: si se detectan ≥3 ciclos `authorize → callback` dentro de 60s, el SDK deja de redirigir, detiene el monitor de sesión y dispara `onAuthFailure({ code: 'AUTH_LOOP_DETECTED' })` para que la app muestre un error accionable en lugar de recargar por siempre. Contador en `sessionStorage` (aislado por pestaña), reseteado automáticamente por cualquier `onAuthSuccess`.
- **Nuevo `AuthErrorCode`**: `AUTH_LOOP_DETECTED`.

### Notes
- **Sin breaking changes**: comportamiento interno de auth; la API pública del SDK no cambia.
- **Minor bump** (4.3.1 → 4.4.0): nuevas capacidades de coordinación multi-tab y protección anti-loop.
- Requiere console backend con el filtro de auto-authorize (mismo change) para cerrar la causa raíz #2.
- Tests nuevos: `tests/oauth-flow-lock.test.ts` (9) y `tests/auth-loop-guard.test.ts` (6). Suite completa: 180 passed.

## 4.3.0 (2026-07-20)

### Added
- **Gestión de usuarios desde el SDK**: nuevos métodos en `TGTAuthClient` (browser) que consumen la API de Console (`/api/v1/users/*`):
  - `inviteUser(data)` — crea usuario, asigna roles y envía email de invitación con contraseña temporal.
  - `updateUser(profileId, data)` — actualiza perfil y/o roles de aplicación (el session cache notifica cambios en tiempo real).
  - `deleteUser(profileId)` — soft delete + revocación de sesiones.
  - `reactivateUser(profileId)` — reactiva un usuario eliminado.
  - `resendInvitation(profileId)` — reenvía el email de invitación (regenera contraseña temporal).
  - `getUsersMap(tenantId)` — mapa `userId → UserSummary` para resolver nombres/emails en listados que solo guardan userId (solo usuarios activos).
  - `listUsers(tenantId)` y `getApplicationRoles(appId)` ahora retornan tipos estrictos (`UserProfile[]`, `ApplicationRoleInfo[]`) en vez de `any[]`.
- **`TGTAdminClient` (server-side)**: nuevo cliente exportable desde `@tgtone/auth-sdk/server` para backends (Node/Bun), sin dependencias del DOM. Doble modo de autenticación (exactamente uno requerido):
  - `token` — JWT de admin reenviado desde el request del frontend.
  - `maintenanceKey` — MAINTENANCE_API_KEY del ecosistema (header `x-maintenance-key`) para cron jobs, webhooks y sincronización.
  - Expone los mismos métodos de gestión de usuarios que el cliente browser.
- **Tipos nuevos**: `ApplicationAccess`, `InviteUserData`, `UpdateUserData`, `UserApplicationAssignment`, `UserProfile`, `UserSummary`, `ApplicationRoleInfo`, `InviteUserResult`, `UpdateUserResult`, `UserActionResult`.
- **Docs**: nuevo `docs/USERS_MANAGEMENT.md` con patrones de integración (frontend puro, backend con JWT reenviado, backend con maintenance key).

### Changed (Console backend)
- Nuevo guard `requireAuthOrMaintenanceKey` en `src/plugins/guards.ts`: permite que los endpoints `/api/v1/users/*` sean consumidos con `x-maintenance-key` (validación timing-safe) además del JWT de admin. Aplicado en `src/modules/users/users.plugin.ts` (`/me/permissions` mantiene `requireAuth` puro porque depende del sub del JWT).

### Notes
- **Sin breaking changes**: todos los cambios son aditivos. Consumidores solo actualizan la dependencia.
- **Minor bump** (4.2.0 → 4.3.0): nuevas funcionalidades de gestión de usuarios.
- `TGTAdminClient` NO se exporta desde el index principal (browser) — solo desde `./server`, garantizando que bundlers de frontend no lo incluyan.

## 4.2.0 (2026-07-10)

### Fixed
- **SSO auto-login después de 15 minutos**: El backend ahora lee la cookie `tgtone_refresh` (30 días) cuando `tgtone_session` (15 min) expira, permitiendo auto-authorize sin mostrar el formulario de login. Antes, el SSO solo funcionaba por 15 minutos.
- **Cookie de refresh actualizada**: El endpoint `POST /refresh` ahora setea cookies `Set-Cookie` en la respuesta, manteniendo `tgtone_refresh` sincronizada con el token rotado. Antes la cookie quedaba stale (con el token original ya borrado de la BD).
- **Race condition en rotación de refresh token**: `validateAndRotate` ahora marca la sesión vieja con `rotatedAt` (grace period de 60s) en vez de borrarla inmediatamente. Si dos tabs/apps hacen refresh simultáneo, la segunda no dispara `revokeAllSessions`.

### Added
- **`credentials: 'include'`** en `fetch` de `_executeRefresh()`, `handleCallback()` y `exchangeAccessToken()`. Permite que el browser reciba y almacene las cookies `Set-Cookie` del backend cross-origin.
- **`validateRefreshToken()`** en `SessionService`: valida un refresh token sin rotarlo, para uso del auto-authorize.
- **Campo `rotatedAt`** en modelo `Session` (schema.prisma): timestamp de cuándo fue rotada la sesión, para grace period.

### Changed
- **`validateAndRotate`**: no borra la sesión vieja inmediatamente. La marca como `rotatedAt` y la borra después del grace period (60s). `detectTokenReuse` ya no dispara `revokeAllSessions` durante el grace period.
- **`cleanExpiredSessions`**: ahora también limpia sesiones rotadas que pasaron el grace period.
- **Minor version bump** (4.1.2 → 4.2.0): cambios en backend + SDK que afectan el flujo de auth.

### Migration
- Aplicar migración `20260710000538_add_session_rotated_at` (agrega columna `rotated_at` a tabla `sessions`).
- El SDK requiere re-build (`npm run build`) pero sin cambios de API pública para los consumidores.

## 4.1.2 (unreleased)

### Added
- **`hasRefreshToken()`**: nuevo método público para verificar si existe refresh token en localStorage sin acceder directamente a la API interna. Útil para determinar si la sesión puede renovarse automáticamente.
- **Storage check en constructor**: verifica disponibilidad de localStorage al inicializar el SDK. Advierte con `console.warn` si localStorage no está disponible (Safari Private, Brave Shields, cuota 5MB llena).

## 4.1.1 (2026-06-15)

### Added
- **Multi-tab refresh token sync**: Implementada sincronización del refresh token entre pestañas del mismo origen vía `BroadcastChannel` + evento `storage` como fallback. Cuando una tab refresca exitosamente el token, las otras tabs reciben el nuevo token automáticamente, evitando el error 401 por token rotado entre tabs. Ver `_initMultiTabSync()`, `_broadcastRefreshToken()`, `_cleanupMultiTabSync()`.
- **checkSession deduplicado**: `checkSession()` ahora reusa la Promise si ya hay una verificación en vuelo, evitando doble `/me` en React Strict Mode.

### Fixed
- **clearRefreshToken solo en 401**: Antes se borraba el refresh token en cualquier HTTP error (502/503 incluido), matando la sesión aunque el token fuera válido por 30 días. Ahora solo se borra en `401 Unauthorized`.
- **Heartbeat apilable**: Reemplazado `setInterval` por `setTimeout` recursivo. Si un refresh tarda más que el intervalo, el próximo tick espera a que el actual termine (no más ejecuciones concurrentes del heartbeat).
- **refreshPromise cleanup garantizado**: La Promise de refresh ahora usa `.finally()` para liberar la referencia, incluso si hay errores en el await.
- **visibilityWakeHandler**: Ahora usa `this.getStoredToken()` en vez de `this.currentUser?.sub`, ya que `currentUser` puede ser null incluso cuando hay token válido (ej: SSR, page load antes de checkSession).
- **Visibility listeners con guard**: `_startVisibilityListener` y `_stopVisibilityListener` ahora usan `_visibilityListenersActive` para evitar duplicar event listeners.
- **Logs en catch blocks**: Agregados logs en 5 catch blocks silenciosos (logout, parseo backend, parseo permisos, parseo WS, parseo refresh).

### Changed
- `startSessionMonitor()`: heartbeat cambió de `setInterval` a `setTimeout` recursivo + `_heartbeatTick` como método propio.

### Notes
- **Sin cambios de API pública**: Todos los fixes son internos. Consumidores solo necesitan actualizar la dependencia y re-buildear.
- **Sin nuevos parámetros de configuración**: BroadcastChannel se inicializa automáticamente. Si no está disponible (Safari < 15.4), cae al evento `storage`.
- **Sin impacto en SSR**: Los `typeof window === 'undefined'` guards previenen errores en server-side rendering.
