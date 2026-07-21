# Changelog - @tgtone/auth-sdk

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
