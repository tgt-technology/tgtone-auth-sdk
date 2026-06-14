# Changelog - @tgtone/auth-sdk

## 4.1.0 (2026-06-13)

### Removed
- **REST session check fallback**: Eliminado `startSessionCheckFallback()` y `stopSessionCheckFallback()`. Este REST polling cada 60s a `/session/check/:userId` era un workaround pre-Redis-Streams. Ahora Redis Streams maneja todas las notificaciones de sesión vía WebSocket (SESSION_REVOKED, ROLES_CHANGED, etc.). Causaba falsos positivos de "sesión expirada por inactividad" por TTL de Redis, no por revocación real.
- **Direct heartbeat**: Eliminado `startDirectHeartbeat()` y `stopDirectHeartbeat()`. El POST a `/session/heartbeat` cada 5 minutos solo lo consultaba el session check eliminado. Sin consumidor, no tiene propósito.
- Eliminadas propiedades internas: `sessionCheckTimer`, `directHeartbeatTimer`, `_wakeInProgress`, `SESSION_CHECK_INTERVAL_MS`.

### Simplified
- `_tryWakeRefresh()` simplificado: ya no re-registra en Redis vía heartbeat directo. Solo refreshAccessToken() con delay de 3s para recuperación de red.

### Changed
- `startSessionMonitor()` ya no arranca session check ni heartbeat directo. Solo conecta WebSocket + refresh proactivo JWT.
- `stopSessionMonitor()` ya no detiene session check ni heartbeat directo.
- `stopSessionCache()` simplificado: solo desconecta WS.

### Notes
- `heartbeatIntervalMs` en config sigue usándose para el refresh proactivo del JWT (verificar expiración cada N ms). No afecta.
- `sessionCacheUrl` en config sigue usándose para conectar WS. No eliminado.
- El WebSocket (Redis Streams) es ahora el único canal de notificaciones de sesión en tiempo real.
