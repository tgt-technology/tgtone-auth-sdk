# Ejemplos de Integración por Framework

Guía paso a paso para integrar TGT One Auth en diferentes frameworks usando el paquete npm.

---

## React (Vite)

### 1. Instalar

```bash
npm install @tgtone/auth-sdk
```

### 2. Usar el hook `useTGTAuth`

```tsx
// src/App.tsx
import { useTGTAuth } from '@tgtone/auth-sdk/react';

function App() {
  const { session, loading, logout, hasRole, revokedError } = useTGTAuth({
    identityUrl: import.meta.env.VITE_IDENTITY_URL || 'https://identity.tgtone.cl',
    appDomain: window.location.host,
    appKey: import.meta.env.VITE_APP_KEY, // Requerido en dev
    enableHeartbeat: true,
    debug: import.meta.env.DEV,
  });

  if (loading) return <LoadingSpinner />;
  if (revokedError) return <RevokedPage error={revokedError} />;
  if (!session) return null;

  return (
    <div>
      <header>
        <span>{session.user.name} - {session.tenantName}</span>
        <button onClick={logout}>Cerrar sesión</button>
      </header>
      {hasRole('zenith', 'admin') && <AdminPanel />}
    </div>
  );
}
```

### 3. Interceptor Axios para API calls

```tsx
import { createAxiosInterceptor } from '@tgtone/auth-sdk/interceptor';
import { useTGTAuth } from '@tgtone/auth-sdk/react';

function Dashboard() {
  const { authClient, session } = useTGTAuth({
    identityUrl: 'https://identity.tgtone.cl',
    appDomain: 'zenith.tgtone.cl',
  });

  useEffect(() => {
    if (!session) return;

    const api = axios.create({ baseURL: '/api' });
    const cleanup = createAxiosInterceptor(api, authClient, {
      handleRevoked: true,
      excludeUrls: ['/public/'],
    });

    return cleanup;
  }, [session, authClient]);
}
```

---

## Vue 3 (Vite)

### 1. Instalar

```bash
npm install @tgtone/auth-sdk
```

### 2. Crear composable

```typescript
// src/composables/useAuth.ts
import { ref, onMounted } from 'vue';
import { TGTAuthClient, type TGTSession } from '@tgtone/auth-sdk';

const authClient = new TGTAuthClient({
  identityUrl: import.meta.env.VITE_IDENTITY_URL || 'https://identity.tgtone.cl',
  appDomain: window.location.host,
  appKey: import.meta.env.VITE_APP_KEY, // Requerido en dev
  heartbeatIntervalMs: 5 * 60 * 1000,
  debug: import.meta.env.DEV,
});

const session = ref<TGTSession | null>(null);
const loading = ref(true);

export function useAuth() {
  onMounted(async () => {
    session.value = await authClient.checkSession();
    loading.value = false;

    if (session.value) {
      authClient.startHeartbeat();
    }
  });

  const logout = async () => {
    authClient.stopHeartbeat();
    await authClient.logout();
    session.value = null;
  };

  const hasRole = (appName: string, roleName: string) => {
    return authClient.hasRole(appName, roleName);
  };

  const hasAccessToApp = (appName: string) => {
    return authClient.hasAccessToApp(appName);
  };

  return { session, loading, logout, hasRole, hasAccessToApp, authClient };
}
```

### 3. Usar en componente

```vue
<!-- src/App.vue -->
<template>
  <div v-if="loading" class="loading">
    <div class="spinner"></div>
  </div>

  <div v-else-if="session" class="app">
    <nav>
      <h1>Mi App</h1>
      <span>{{ session.user.name }} - {{ session.tenantName }}</span>
      <button @click="logout">Cerrar sesión</button>
    </nav>

    <div v-if="hasRole('baco', 'admin')">
      Panel de Administración
    </div>

    <router-view />
  </div>
</template>

<script setup lang="ts">
import { useAuth } from './composables/useAuth';
const { session, loading, logout, hasRole } = useAuth();
</script>
```

---

## Next.js 14 (App Router)

### 1. Instalar

```bash
npm install @tgtone/auth-sdk
```

### 2. Crear Provider (client component)

```tsx
// app/providers/auth-provider.tsx
'use client';

import { useTGTAuth } from '@tgtone/auth-sdk/react';
import { createContext, useContext } from 'react';
import type { UseTGTAuthResult } from '@tgtone/auth-sdk/react';

const AuthContext = createContext<UseTGTAuthResult | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const auth = useTGTAuth({
    identityUrl: process.env.NEXT_PUBLIC_IDENTITY_URL || 'https://identity.tgtone.cl',
    appDomain: typeof window !== 'undefined' ? window.location.host : '',
    appKey: process.env.NEXT_PUBLIC_APP_KEY,
    enableHeartbeat: true,
    debug: process.env.NODE_ENV === 'development',
  });

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
};
```

### 3. Envolver en layout

```tsx
// app/layout.tsx
import { AuthProvider } from './providers/auth-provider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
```

### 4. Usar en páginas

```tsx
// app/page.tsx
'use client';

import { useAuth } from './providers/auth-provider';

export default function HomePage() {
  const { session, loading, logout, hasRole, revokedError } = useAuth();

  if (loading) return <Spinner />;
  if (revokedError) return <RevokedPage error={revokedError} />;
  if (!session) return null;

  return (
    <div>
      <header>
        <span>{session.user.name}</span>
        <button onClick={logout}>Cerrar sesión</button>
      </header>
      {hasRole('console', 'owner') && <OwnerSettings />}
    </div>
  );
}
```

---

## Angular 17+

### 1. Instalar

```bash
npm install @tgtone/auth-sdk
```

### 2. Crear servicio

```typescript
// src/app/services/auth.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { TGTAuthClient, TGTSession, AuthError } from '@tgtone/auth-sdk';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private authClient: TGTAuthClient;
  private sessionSubject = new BehaviorSubject<TGTSession | null>(null);
  private loadingSubject = new BehaviorSubject<boolean>(true);
  private revokedSubject = new BehaviorSubject<AuthError | null>(null);

  session$ = this.sessionSubject.asObservable();
  loading$ = this.loadingSubject.asObservable();
  revokedError$ = this.revokedSubject.asObservable();

  constructor() {
    this.authClient = new TGTAuthClient({
      identityUrl: 'https://identity.tgtone.cl',
      appDomain: window.location.host,
      appKey: 'console', // Ajustar según la app
      onSessionRevoked: (error) => {
        this.revokedSubject.next(error);
        this.sessionSubject.next(null);
      },
      debug: !environment.production,
    });

    this.checkSession();
  }

  private async checkSession() {
    try {
      const session = await this.authClient.checkSession();
      this.sessionSubject.next(session);

      if (session) {
        this.authClient.startHeartbeat();
      }
    } catch (error) {
      console.error('Error checking session:', error);
    } finally {
      this.loadingSubject.next(false);
    }
  }

  async logout() {
    this.authClient.stopHeartbeat();
    await this.authClient.logout();
    this.sessionSubject.next(null);
  }

  hasRole(appName: string, roleName: string): boolean {
    return this.authClient.hasRole(appName, roleName);
  }

  hasAccessToApp(appName: string): boolean {
    return this.authClient.hasAccessToApp(appName);
  }
}
```

### 3. Usar en componente

```typescript
// src/app/app.component.ts
import { Component } from '@angular/core';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  template: `
    <div *ngIf="auth.loading$ | async" class="loading">
      <div class="spinner"></div>
    </div>

    <div *ngIf="auth.revokedError$ | async as error" class="blocked">
      <h2>Acceso bloqueado</h2>
      <p>{{ error.message }}</p>
    </div>

    <div *ngIf="(auth.session$ | async) as session">
      <nav>
        <h1>Mi App</h1>
        <span>{{ session.user.name }}</span>
        <button (click)="logout()">Cerrar sesión</button>
      </nav>
      <div *ngIf="auth.hasRole('zenith', 'admin')">Admin Panel</div>
      <router-outlet />
    </div>
  `,
})
export class AppComponent {
  constructor(public auth: AuthService) {}

  logout() {
    this.auth.logout();
  }
}
```

---

## Variables de Entorno por App

| App | `VITE_APP_KEY` | `VITE_APP_DOMAIN` |
|-----|---------------|-------------------|
| Zenith (CRM) | `zenith` | `zenith.tgtone.cl` |
| Baco (Wine) | `baco` | `baco.tgtone.cl` |
| Console (Admin) | `console` | `console.tgtone.cl` |

```env
# .env.local (ejemplo para Baco en dev)
VITE_IDENTITY_URL=https://identity.tgtone.cl
VITE_APP_KEY=baco
```

> En producción, si el dominio es `baco.tgtone.cl`, el SDK extrae el app key automáticamente y `appKey` no es necesario.

---

## Checklist de Integración

- [ ] `npm install @tgtone/auth-sdk`
- [ ] Configurar variables de entorno (`VITE_IDENTITY_URL`, `VITE_APP_KEY`)
- [ ] Implementar hook/composable/provider según framework
- [ ] Manejar estados: `loading`, `session`, `revokedError`
- [ ] Bloquear renderizado mientras `loading === true` (evita que Router limpie `?token=`)
- [ ] Configurar interceptor Axios/Fetch para API calls
- [ ] Probar flujo login/logout
- [ ] Probar detección de sesión revocada (desactivar usuario en Console)
- [ ] Verificar roles y permisos por app

---

## Referencia

- **[QUICKSTART_REACT.md](./QUICKSTART_REACT.md)** - Quick Start detallado para React
- **[API.md](./API.md)** - Referencia completa de API
- **[CHANGELOG.md](../CHANGELOG.md)** - Historial de cambios
