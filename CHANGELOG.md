# Changelog - @tgtone/auth-sdk

All notable changes to this project will be documented in this file.

## v3.5.0 (2026-06-04)

### Added

- **`SESSION_EXPIRED`**: nuevo `AuthErrorCode` para cuando la key de Redis expiró por inactividad (suspensión del PC, sin revocación real).
- **`ACCESS_REVOKED`**: nuevo `AuthErrorCode` para cuando se revoca el acceso a una app específica (roles removidos, app eliminada).

### Changed

- **WS handler `SESSION_REVOKED_BULK`**: ahora usa `TENANT_INACTIVE` en vez de `USER_INACTIVE`. Mensaje: "Tu organización fue suspendida/eliminada".
- **WS handler `ACCESS_REVOKED`**: ahora usa `ACCESS_REVOKED` en vez de `APP_SUBSCRIPTION_LOCKED`. Mensaje con razón legible (`roles_removed`, `subscription_blocked`, `app_removed`, etc.).
- **Session check fallback**: al detectar `valid: false` y fallar el wake refresh, ahora emite `SESSION_EXPIRED` en vez de `USER_INACTIVE`.
- **`mapErrorCodeToBlockedType`**: ahora soporta `expired` y `access` como tipos de bloqueo.

### Fixed

- **WS `ACCESS_REVOKED`**: ya no se confunde con `APP_SUBSCRIPTION_LOCKED`. El frontend puede distinguir "te sacaron los roles" de "tu suscripción está bloqueada".
- **WS `SESSION_REVOKED_BULK`**: ya no dice "Tu cuenta fue suspendida" cuando es el tenant el suspendido.

## v3.4.4 (2026-06-04)

### Added

- **Wake-from-suspend resilience**: cuando el PC se suspende y la key de Redis expira, el SDK ya no revoca inmediatamente. En vez de eso, intenta `refreshAccessToken()` (que usa el refresh token, válido 7 días) para regenerar la sesión sin mostrar login.
- **Visibility listener**: `_startVisibilityListener()` escucha `visibilitychange` y `pageshow` para detectar cuando la pestaña vuelve a estar visible y dispara un refresh proactivo (con 3s de delay para que el network stack se recupere).

### Changed

- `startSessionCheckFallback()`: al detectar `valid: false` en el Session Cache, ahora intenta `_tryWakeRefresh()` antes de revocar.
- `stopSessionMonitor()`: ahora detiene también el visibility listener.

## v3.4.3 (2026-06-04)

### Added

- **Heartbeat directo al Session Cache**: `startDirectHeartbeat()` mantiene viva la key en Redis sin pasar por el backend Cloud Run. Cada `heartbeatIntervalMs` (5 min default) hace `POST {sessionCacheUrl}/api/session/heartbeat` directo a Linode. Elimina el problema de falsa revocación cuando el backend está en cold start durante el refresh del token.

## v3.4.1 (2026-05-28)

### Added

- **`TGTAuthClient.getStoredToken()`**: Método estático para obtener el token JWT sin necesitar una instancia del cliente. Ideal para HTTP clients que se inicializan a nivel módulo antes del AuthContext.
- **`getToken()` en `useTGTAuth`**: El hook ahora expone `getToken()` para que las apps no tengan que acceder a `localStorage` directamente.

### Fixed

- Las apps ya no necesitan hacer `localStorage.getItem('tgtone_auth_token')` manualmente. Usar `TGTAuthClient.getStoredToken()` (estático) o `getToken()` desde `useTGTAuth`.

---

## v3.4.0 (2026-05-28)

### Added

- **`onPermissionsChanged(app, newRoles)`**: Callback vía WebSocket cuando un admin cambia los roles del usuario.
- **`onAccessRevoked(app, reason)`**: Callback vía WebSocket cuando se revoca el acceso a una app (suscripción bloqueada, eliminada, roles removidos).
- **WebSocket autenticación**: El SDK ahora envía `{ type: 'auth', userId }` al conectar al Session Cache para entrega dirigida.
- **Manejo de `ROLES_CHANGED`**: Refetch de permisos en tiempo real, sin necesidad de F5.
- **Manejo de `ACCESS_REVOKED`**: Si es la app activa → `showBlockedPage()` automáticamente.
- **Manejo de `SESSION_REVOKED_BULK`**: Logout forzado cuando un tenant es suspendido/eliminado.

---

## v3.3.1 (2026-05-28)

### Added

- **Métodos URL centralizados**: `getLoginUrl()`, `getSignupUrl()`, `getLoginApiUrl()`, `getMeUrl()`, `getLogoutUrl()`, `getRefreshUrl()`, `getTokenUrl()`, `getExchangeUrl()`, `getPermissionsUrl()`, `getMfaSetupUrl()`, `getMfaVerifySetupUrl()`, `getMfaVerifyLoginUrl()`, `getMfaDisableUrl()`, `getCheckEmailUrl()`, `getChangePasswordUrl()`. Todas las rutas auth ahora se definen en un solo lugar.
- **`showBlockedPage(error)`**: Helper para mostrar página de sesión bloqueada. Si hay callback `onSessionRevoked`, lo ejecuta; si no, redirige a `/blocked`.

### Changed

- **Refactor interno**: Todos los métodos existentes (`login()`, `signup()`, `logout()`, `authorize()`, `handleCallback()`, etc.) ahora usan internamente los nuevos métodos URL. Sin cambio de API pública.

### Migration from v3.3.0

No hay breaking changes. Las apps pueden empezar a usar los nuevos métodos URL en vez de hardcodear rutas auth.

---

## v3.3.0 (2026-05-28)

### Changed

- **OAuth authorize URL**: `authorize()` ahora redirige a `${identityUrl}/login` en vez de `${identityUrl}/api/v1/auth/authorize`. Las páginas de login se movieron a URLs limpias (sin `/api/v1/`).

### Migration from v3.2.0

No hay breaking changes. El método `authorize()` sigue funcionando igual, solo cambia la URL de destino.

---

## v3.2.0 (2026-05-28)

### Added

- **Session Cache**: Nuevo `sessionCacheUrl` en `TGTAuthConfig` para conectar WebSocket + REST fallback a un Session Cache (VPS Linode). Permite notificación instantánea de revocación de sesión, sin depender del heartbeat tradicional de 5 min.
- **`connectSessionCache()`**: Conecta WebSocket al session cache. Reconexión automática con backoff exponencial.
- **`startSessionCheckFallback()`**: REST fallback cada 60s si el WebSocket se cae.
- **`stopSessionCache()`**: Limpieza de WebSocket, REST fallback y timers.
- **Session monitor**: activa session cache automáticamente al iniciar el monitor si `sessionCacheUrl` está configurado.

### Changed

- **Session monitor**: al detenerse (`stopSessionMonitor`), también detiene el session cache.
- **`InternalAuthConfig`**: incluye `sessionCacheUrl` opcional.

### Migration from v3.1.0

No hay breaking changes. Si no configuras `sessionCacheUrl`, todo funciona como antes (heartbeat c/5 min).

---

## v3.1.0 (2026-05-26)

### Changed

- **JWT payload camelCase**: Todos los custom claims del JWT ahora usan camelCase (`tenantId`, `tenantName`, `emailVerified`) en vez de snake_case (`tenant_id`, `tenant_name`, `email_verified`). Los claims estandar RFC 7519 (`sub`, `iss`, `aud`, `exp`, `iat`, `jti`) se mantienen en snake_case segun el standard.
- **`JWTPayload` interface**: Actualizada a camelCase para los custom claims.
- **`buildSessionFromToken()`**: Mapea los nuevos campos camelCase del JWT.
- **`_checkSessionCore()`**: Normaliza la respuesta de `/auth/me` con fallback legacy (acepta ambos formatos).
- **Tests**: Todos los mock JWT payloads actualizados a camelCase.

### Migration from v3.0.x

No hay breaking changes para consumers del SDK. Los JWTs firmados por el backend nuevo usan camelCase. Si tienes JWTs viejos con snake_case, el SDK los acepta via fallback en `_checkSessionCore`.

**Importante**: El backend debe estar actualizado para emitir JWTs con camelCase.

## v3.0.1 (2026-05-26)

### Fixes

- **OAuth PKCE automatico via appKey**: `authorize()`, `handleCallback()`, `redirectToLogin()` y `_checkSessionCore()` ahora derivan `clientId` de `appKey` y `redirectUri` de `appDomain` automaticamente. No se necesita configurar `clientId` ni `redirectUri` explicitamente.
- **Constructor**: setea `clientId = appKey` si no se proporciona, y `redirectUri` desde `window.location.protocol + appDomain`
- **authorize()**: usa variables locales con fallback a `appKey` para `client_id` y a `appDomain` para `redirect_uri`
- **handleCallback()**: mismo patron — deriva clientId/redirectUri si faltan
- **redirectToLogin()**: condicion actualizada a `clientId || appKey` para detectar OAuth
- **_checkSessionCore()**: deteccion de callback OAuth con `clientId || appKey`

### Migration from v3.0.0

Si ya usabas v3.0.0 con `clientId` explicito, no hay breaking changes. Si usabas `appKey`, ahora OAuth PKCE funciona automaticamente:

```typescript
// Antes (v3.0.0) — necesitabas clientId explicito
new TGTAuthClient({ appKey: 'console', clientId: 'console', redirectUri: 'http://localhost:8080', ... })

// Ahora (v3.0.1) — appKey es suficiente
new TGTAuthClient({ appKey: 'console', ... })
```

## v2.0.0 (2026-05-19)

### Breaking Changes

**`TGTUser` interface — snake_case eliminados**

Los campos snake_case fueron eliminados de `TGTUser`. Solo los nombres camelCase están disponibles:

| Campo eliminado | Campo requerido |
|-----------------|-----------------|
| `email_verified` | `emailVerified` |
| `tenant_id` | `tenantId` |
| `tenant_name` | `tenantName` |

**Antes (v1.x):**
```typescript
const tenantId = user.tenant_id;    // ❌ Ya no existe
const verified = user.email_verified; // ❌ Ya no existe
```

**Ahora (v2.0):**
```typescript
const tenantId = user.tenantId;      // ✅
const verified = user.emailVerified; // ✅
```

### Migración

| App | Cambio |
|-----|--------|
| hub | Sin cambios (usa JWT decode manual, no TGTUser) |
| landing | `user.tenant_name` → `user.tenantName` (1 línea) |
| console | `user.tenant_id` → `user.tenantId` (3 archivos) |

### Nota
- El JWT payload del backend **sigue usando snake_case** (`email_verified`, `tenant_id`, `tenant_name`). Esto es correcto — el SDK los mapea internamente a camelCase.
- Apps que decodifican JWT manualmente (`JSON.parse(atob(...))`) deben seguir usando snake_case para leer el payload crudo.

## v1.9.0 (2026-05-19)

### Refactoring
- **DRY:** `buildSessionFromToken()` — private helper que elimina 5 bloques duplicados de construcción de sesión (signup, login, verifyMfa, exchangeAccessToken, _executeRefresh). Retorna `TGTSession` typed en vez de `void`
- **DRY:** `checkSession()` y `checkSessionSilent()` unificados en `_checkSessionCore({ silent, validateWithServer })` — ~174 líneas eliminadas, un solo lugar para bug fixes de validación

### Fixes
- **Revocación en getPermissions:** `getPermissions()` ahora detecta errores de revocación (USER_INACTIVE, TENANT_INACTIVE, etc.) y detiene el heartbeat + dispara `handleSessionRevoked()` en vez de solo loggear y retornar null
- **Logout limpia monitor:** `logout()` ahora llama `stopHeartbeat()` y `clearPermissionsCache()` antes del fetch al backend — evita que el monitor siga corriendo con tokens invalidados

### DX
- **Package exports:** `package.json` con exports map formal (`.`, `./react`, `./interceptor`) — tree-shakeable y autocompletado correcto en IDEs
- **Interceptor tipado:** Interfaces `AxiosLike` y `AxiosErrorLike` reemplazan `any` en `interceptor.ts`. `eslint-disable` eliminado
- **Hook limpio:** `useTGTAuth` usa `shouldEnableMonitorRef` (useRef) en vez de hack `(clientRef.current as any)._shouldEnableMonitor`
- **Tests:** 14 tests nuevos para lógica del hook (config construction, callbacks, flags) — total 90 tests

### Breaking changes
- Ninguno. La API pública es 100% compatible con v1.8.0

## v1.8.0 (2026-05-18)

- **New:** Auto-exchange SSO - `checkSession()` y `checkSessionSilent()` llaman automaticamente `POST /auth/exchange` cuando detectan un token en la URL (flujo SSO redirect), obteniendo un refresh token sin codigo extra en la app
- **New:** `checkSessionSilent()` ahora intenta `refreshAccessToken()` cuando el JWT esta expirado, en vez de descartar la sesion inmediatamente. Si hay un refresh token valido, la sesion se restaura
- **New:** Axios interceptor (`createAxiosInterceptor`) ahora maneja `TOKEN_EXPIRED` automaticamente: refresca el token y reintenta el request original, igual que el Fetch interceptor (`createAuthFetch`)
- **Fix:** Apps que usan el flujo SSO redirect (`?token=xxx`) ahora obtienen sesiones persistentes (duración del refresh token) en vez de sesiones de ~15 minutos

## v1.7.1 (2026-05-01)

- **New:** `localLogout()` - Cierra sesión sin redirigir al Identity Provider
  - Limpia tokens, sesión y caché de permisos localmente e invalida el token en el backend (best-effort)
  - A diferencia de `logout()`, NO ejecuta `redirectToLogin()`, permitiendo que la app maneje la redirección
  - **Caso de uso:** Apps con acceso restringido a creadores (ej: Hub, que solo permite @tgtone.cl / @tgtgroup.cl). Estas apps tienen su propia página `/login` y no deben seguir el flujo SSO estándar
- **Fix:** Previene redirect 404 al navegar a apps con login propio cuando no hay sesión o la sesión no cumple los criterios de acceso

## v1.7.0 (2026-04-XX)

- **New:** Heartbeat-driven permissions refresh via `onPermissionsStale` callback
  - Heartbeat clears permissions cache and calls `onPermissionsStale` on each successful cycle
  - React hook exposes `permissionsVersion` counter that increments when heartbeat invalidates cache
  - Apps can subscribe to `permissionsVersion` changes to reload permissions without F5
- **New Config:** `onPermissionsStale?: () => void` in `TGTAuthConfig`
- **React Hook:** `useTGTAuth` now exposes `permissionsVersion: number`

## v1.5.0 (2026-04-16)

- **New:** Plan-filtered permissions via `getPermissions()` method
  - Fetches granular permissions from `GET /api/v1/users/me/permissions` (filtered by active plan modules)
  - In-memory cache with 30-minute TTL, invalidated on logout/session revocation
  - `hasModulePermission(module, action, appKey?)` - check specific module/action permission
  - `getPlanModules(appKey?)` - get active plan module keys for an app
  - `clearPermissionsCache()` - manually invalidate cache
- **New Types:** `UserPermissions`, `AppPermissionDetail`, `PermissionsStructure`, `PermissionModules`
- **React Hook:** `useTGTAuth` now exposes `getPermissions`, `hasModulePermission`, `getPlanModules`, `clearPermissionsCache`
- Permissions endpoint returns `planModules` field per application indicating which modules are active in the plan

## v1.4.4 (2026-04-14)

- **Docs:** Documentation restructured and standardized
  - `docs/LOVABLE_QUICK_START.md` renamed to `docs/QUICKSTART_REACT.md`
  - `docs/NPM_PUBLISH.md` renamed to `docs/PUBLISHING.md`
  - New `docs/API.md` with complete API reference (all methods, types, interceptors, React hook)
  - New `CHANGELOG.md` extracted from README (separate file)
  - `docs/QUICKSTART_REACT.md` rewritten to use `useTGTAuth` hook with `appKey`, heartbeat, and session revocation
  - `docs/INTEGRATION_EXAMPLES.md` updated to use `npm install` instead of manual file copy
  - `README.md` now links to `CHANGELOG.md` instead of inline changelog
  - All version references updated to match `package.json`
- **Package:** `CHANGELOG.md` and `MIGRATION_GUIDE.md` added to `files` array for npm publishing

## v1.4.3 (2026-04-14)

- **New:** Config `appKey` for explicitly specifying the application key
- Fixes issue where `getCurrentAppKey()` extracted `dev-baco` in dev environments instead of `baco`
- Allows using the SDK in localhost (previously returned undefined because host was localhost)
- **Usage:** `new TGTAuthClient({ appKey: 'baco', ... })` or `useTGTAuth({ appKey: 'baco', ... })`

## v1.4.2 (2026-04-13)

- **Fix:** `checkSession()` now redirects to `/blocked` (not `/login`) when the backend returns revocation errors (`APP_SUBSCRIPTION_LOCKED`, `USER_INACTIVE`, etc.)
- Previously, `handleNoSession()` always redirected to `/login` regardless of error type. Now detects revocation errors and uses `handleSessionRevoked()` consistent with the heartbeat.

## v1.4.1 (2026-04-11)

- Patch bump

## v1.4.0 (2026-04-10)

- `APP_SUBSCRIPTION_LOCKED` and `TRIAL_EXPIRED` detected by heartbeat and Axios/Fetch interceptors
- `isRevocationError()` now returns `true` for all 5 error codes
- `onAuthFailure` callback is now optional: if provided, does NOT auto-redirect to login
- Internal refactoring: safe types (`InternalAuthConfig`), duplicate code removal
- Removed stub `useTGTAuth` from main file (real hook in `react-hook.tsx`)

## v1.3.0 (2026-03-26)

- **Session Revocation:** Automatic detection of deleted user/tenant
- `startHeartbeat()` / `stopHeartbeat()` - Periodic session validation
- `onSessionRevoked` - Callback for revoked session
- `getBlockedRedirectUrl()` - Redirect URL for revoked session
- New `interceptor.ts` module for Axios/Fetch
- Improved `useTGTAuth` hook with `enableHeartbeat` and `showRevokedState`
- Enhanced `/blocked` page in Identity with error type support

## v1.2.3 (2025-12-27)

- Improved token capture flow from URL to prevent race conditions in SPAs
- Updated documentation on React/Lovable integration best practices

## v1.2.0 (2025-10-30)

- `checkSessionSilent()` - Check session without auto-redirecting
- `allowedRedirectHosts` - Configure allowed hosts for redirects
- `redirectToLogin(redirectUrl)` - Redirect with custom return URL
- `isRedirectAllowed()` - Validate redirect URLs

## v1.1.0 (2025-10-26)

- `signup()` - Create new accounts from the SDK
- `login()` - Login programmatically
- MFA support with `verifyMfa()`

## v1.0.1 (2025-10-16)

- First public version with basic SSO
