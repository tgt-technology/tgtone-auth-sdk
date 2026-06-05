# TGT Auth SDK - Documentation

> SDK de autenticación JWT + Bearer Token para el ecosistema TGT One

---

## Quick Start

**[README principal](../README.md)** - Instalación, API completa y ejemplos de uso

---

## Guías Disponibles

### **[QUICKSTART_REACT.md](./QUICKSTART_REACT.md)**
Guía de integración con React:
- Setup rápido con AuthContext y hooks
- Gestión de sesión y roles
- Verificación silenciosa de sesión
- Testing sin login

### **[API.md](./API.md)**
Referencia completa de API:
- `TGTAuthClient` - Todos los métodos con parámetros y retornos
- `useTGTAuth` - React hook
- Interceptors - Axios y Fetch
- Todos los tipos TypeScript

### **[INTEGRATION_EXAMPLES.md](./INTEGRATION_EXAMPLES.md)**
Ejemplos para otros frameworks:
- Vue.js 3
- Next.js 14 (App Router)
- Angular 17+
- Configuración por app

### **[PUBLISHING.md](./PUBLISHING.md)**
Guía para publicar actualizaciones del SDK a npm

---

## Por Dónde Empezar

| Quiero... | Ver |
|-----------|-----|
| Instalar y usar en cualquier app | [README.md](../README.md) |
| Integrar en React | [QUICKSTART_REACT.md](./QUICKSTART_REACT.md) |
| Ver referencia completa de API | [API.md](./API.md) |
| Ejemplos Vue/Next/Angular | [INTEGRATION_EXAMPLES.md](./INTEGRATION_EXAMPLES.md) |
| Publicar nueva versión | [PUBLISHING.md](./PUBLISHING.md) |
| Ver historial de cambios | [CHANGELOG.md](../CHANGELOG.md) |
| Migrar entre versiones | [MIGRATION_GUIDE.md](../MIGRATION_GUIDE.md) |

---

## Información Clave

**Versión Actual:** 1.4.4
**Autenticación:** JWT + Bearer Token (Authorization header)
**Storage:** localStorage (`tgtone_auth_token`)
**Backend:** https://tgtone-console-backend.run.app/api
**Identity:** https://identity.tgtone.cl

---

**Última actualización:** 2026-04-14
