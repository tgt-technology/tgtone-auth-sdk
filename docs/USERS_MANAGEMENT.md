# Gestión de Usuarios — @tgtone/auth-sdk

> v4.3.0 · Cómo administrar usuarios del identity core (Console) desde cualquier app del ecosistema

---

## Visión general

El identity core (Console backend) es la fuente única de verdad para usuarios, perfiles y roles del ecosistema TGT One. Desde v4.3.0, el SDK expone métodos para gestionar usuarios sin que cada app duplique su propio módulo de usuarios.

Hay dos clientes según el entorno:

| Cliente | Entorno | Auth | Uso típico |
|---------|---------|------|-----------|
| `TGTAuthClient` | Browser (React/Vue/etc.) | JWT del admin (localStorage) | Pantalla de administración de usuarios |
| `TGTAdminClient` | Server (Node/Bun) | JWT reenviado **o** MAINTENANCE_API_KEY | Cron jobs, webhooks, sincronización |

---

## Caso A — Frontend puro (sin backend propio)

La app llama directamente a la API de Console con el JWT del admin logueado.

```typescript
import { useTGTAuth } from '@tgtone/auth-sdk/react';

function UsersAdminPage() {
  const { authClient, session } = useTGTAuth({
    coreApiUrl: import.meta.env.VITE_CORE_API_URL,
    appDomain: window.location.host,
    appKey: 'formflow',
  });

  // Listar usuarios del tenant
  const users = await authClient.listUsers(session.tenantId);

  // Cargar roles disponibles de la app (para dropdown de asignación)
  const roles = await authClient.getApplicationRoles(formflowAppId);

  // Invitar un usuario (crea en el core, asigna rol, envía email con clave temporal)
  const result = await authClient.inviteUser({
    email: 'ana@empresa.cl',
    firstName: 'Ana',
    lastName: 'González',
    tenantId: session.tenantId,
    applicationAccess: [{ applicationId: formflowAppId, roleId: editorRole.id }],
  });

  // Actualizar roles (applicationAccess es la lista COMPLETA — reemplaza)
  await authClient.updateUser(profileId, {
    applicationAccess: [{ applicationId: formflowAppId, roleId: adminRole.id }],
  });

  // Actualizar solo el nombre
  await authClient.updateUser(profileId, { firstName: 'Ana María' });

  // Desactivar (soft delete — revoca sesiones, notifica session cache)
  await authClient.deleteUser(profileId);

  // Reactivar
  await authClient.reactivateUser(profileId);

  // Reenviar invitación (regenera clave temporal)
  await authClient.resendInvitation(profileId);
}
```

### Resolver nombres a partir de userId

Las BD locales de las apps solo deben guardar `userId` (UUID del core). Para mostrar nombres:

```typescript
const usersMap = await authClient.getUsersMap(tenantId);

// En un listado de formularios:
forms.map(form => (
  <tr key={form.id}>
    <td>{form.title}</td>
    <td>{usersMap[form.createdById]?.displayName ?? 'Usuario inactivo'}</td>
  </tr>
));
```

`getUsersMap` solo incluye usuarios **activos**. Si un userId no está en el mapa, el usuario fue eliminado — muestra un fallback.

---

## Caso B — Backend (server-to-server)

```typescript
import { TGTAdminClient } from '@tgtone/auth-sdk/server';
```

### Modo 1: Reenviar JWT del admin

Para operaciones iniciadas por un admin logueado (el frontend manda su JWT a tu backend, y tu backend lo reenvía a Console):

```typescript
const admin = new TGTAdminClient({
  coreApiUrl: process.env.CORE_API_URL!,
  token: request.headers.authorization?.slice(7), // quita "Bearer "
});

const users = await admin.listUsers(tenantId);
```

### Modo 2: MAINTENANCE_API_KEY

Para operaciones sin usuario detrás (cron, webhooks, sincronización):

```typescript
const admin = new TGTAdminClient({
  coreApiUrl: process.env.CORE_API_URL!,
  maintenanceKey: process.env.MAINTENANCE_API_KEY!,
});

await admin.deleteUser(profileId);
```

> **Importante**: el constructor exige exactamente uno de los dos modos. Si pasas ambos o ninguno, lanza error.

### Requisito en Console backend

El modo maintenance key requiere que los endpoints `/api/v1/users/*` acepten el header `x-maintenance-key`. Esto está implementado en Console vía el guard `requireAuthOrMaintenanceKey` (`src/plugins/guards.ts`), que valida la key con comparación timing-safe contra `process.env.MAINTENANCE_API_KEY` y, si no está presente, cae al flujo normal de JWT.

---

## API Reference

### Métodos (disponibles en ambos clientes)

| Método | Firma | Descripción |
|--------|-------|-------------|
| `listUsers` | `(tenantId) → UserProfile[]` | Usuarios del tenant con roles |
| `getUsersMap` | `(tenantId) → Record<userId, UserSummary>` | Lookup userId → nombre/email (solo activos) |
| `inviteUser` | `(data: InviteUserData) → InviteUserResult` | Crear + asignar roles + email de invitación |
| `updateUser` | `(profileId, data: UpdateUserData) → UpdateUserResult` | Actualizar perfil y/o roles |
| `deleteUser` | `(profileId) → UserActionResult` | Soft delete + revocar sesiones |
| `reactivateUser` | `(profileId) → UserActionResult` | Reactivar usuario eliminado |
| `resendInvitation` | `(profileId) → UserActionResult` | Reenviar email de invitación |
| `getApplicationRoles` | `(appId) → ApplicationRoleInfo[]` | Roles disponibles de una app |

### Tipos

```typescript
interface InviteUserData {
  email: string;
  firstName: string;
  lastName: string;
  tenantId: string;
  organizationalRole?: string | null;     // requerido si no hay applicationAccess
  applicationAccess?: ApplicationAccess[]; // requerido si no hay organizationalRole
  customPassword?: string;                 // opcional — el backend genera una temporal
}

interface UpdateUserData {
  firstName?: string;
  lastName?: string;
  organizationalRole?: string | null;
  applicationAccess?: ApplicationAccess[] | null; // lista COMPLETA (reemplaza); null/[] revoca todo
}

interface UserSummary {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;   // "firstName lastName" o email como fallback
  avatarUrl: string | null;
  organizationalRole: string | null;
  applications: UserApplicationAssignment[];
}
```

> **Ojo**: `updateUser`, `deleteUser`, `reactivateUser` y `resendInvitation` reciben el **profileId** (campo `id` de `UserProfile`), NO el `userId`. El `profileId` es el ID del perfil en el tenant; el `userId` es el ID global del usuario.

---

## Variables de entorno

| Variable | Dónde | Descripción |
|----------|-------|-------------|
| `VITE_CORE_API_URL` (o equivalente) | Frontend apps | URL del core (ej: `https://dev-core.tgtone.cl`) |
| `CORE_API_URL` | Backend apps | URL del core para `TGTAdminClient` |
| `MAINTENANCE_API_KEY` | Backend apps + Console | Key compartida para server-to-server |

---

## Patrón recomendado para apps

1. **No duplicar modelo User local.** Guarda solo `userId` (UUID del core) en tus entidades (formularios, respuestas, etc.).
2. **Resuelve nombres con `getUsersMap`** al renderizar listados.
3. **Gestiona usuarios con los métodos del SDK** — no reimplementes invite/update/delete.
4. **Emails automáticos**: el core envía invitación, notificación de actualización, etc. No envíes emails propios para esas acciones.
5. **Roles por app**: asigna roles vía `applicationAccess` — el JWT del usuario los reflejará en su próximo login/refresh, y el session cache notifica cambios en tiempo real.
