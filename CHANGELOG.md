# Changelog - @tgtone/auth-sdk

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
