# API Reference - @tgtone/auth-sdk

> Complete API reference for `@tgtone/auth-sdk` v3.5.7

---

## Table of Contents

- [TGTAuthClient](#tgtauthclient)
  - [Constructor](#constructor)
  - [Authentication](#authentication)
    - [signup()](#signup)
    - [login()](#login)
    - [verifyMfa()](#verifymfa)
    - [logout()](#logout)
  - [Session](#session)
    - [checkSession()](#checksession)
    - [checkSessionSilent()](#checksessionsilent)
    - [getSession()](#getsession)
    - [getUser()](#getuser)
    - [getTenantId()](#gettenantid)
    - [getToken()](#gettoken)
    - [redirectToLogin()](#redirecttologin)
    - [isRedirectAllowed()](#isredirectallowed)
  - [Authorization](#authorization)
    - [hasRole()](#hasrole)
    - [getRoles()](#getroles)
    - [hasAccessToApp()](#hasaccesstoapp)
  - [Heartbeat & Session Revocation](#heartbeat--session-revocation)
    - [startHeartbeat()](#startheartbeat)
    - [stopHeartbeat()](#stopheartbeat)
    - [isHeartbeatActive()](#isheartbeatactive)
    - [getBlockedRedirectUrl()](#getblockedredirecturl)
- [Utilities](#utilities)
  - [isRevocationError()](#isrevocationerror)
  - [REVOCATION_ERROR_CODES](#revocation_error_codes)
- [HTTP Interceptors](#http-interceptors)
  - [createAxiosInterceptor()](#createaxiosinterceptor)
  - [createAuthFetch()](#createauthfetch)
  - [handleAuthError()](#handleautherror)
- [React Hook](#react-hook)
  - [useTGTAuth()](#usetgtauth)
- [TypeScript Types](#typescript-types)

---

## TGTAuthClient

Main authentication client. Handles JWT tokens, session management, SSO flow, and heartbeat.

### Constructor

```typescript
new TGTAuthClient(config: TGTAuthConfig)
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `config` | `TGTAuthConfig` | Yes | Configuration object |

**Example:**

```typescript
import { TGTAuthClient } from '@tgtone/auth-sdk';

const auth = new TGTAuthClient({
  identityUrl: 'https://identity.tgtone.cl',
  appDomain: 'zenith.tgtone.cl',
  appKey: 'zenith',
  debug: true,
  allowedRedirectHosts: ['tgtone.cl', 'app.tgtone.cl'],
  heartbeatIntervalMs: 5 * 60 * 1000,
});
```

---

## Authentication

### signup()

Creates a new user account and tenant.

```typescript
signup(data: SignupData): Promise<AuthResponse>
```

**Parameters (`SignupData`):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | `string` | Yes | User email |
| `password` | `string` | No | If not provided, backend generates a temporary one |
| `firstName` | `string` | Yes | First name |
| `lastName` | `string` | Yes | Last name |
| `tenantName` | `string` | Yes | Name of the new tenant |

**Returns:** `Promise<AuthResponse>`

**Example:**

```typescript
const result = await auth.signup({
  email: 'user@empresa.cl',
  password: 'Pass123!',
  firstName: 'María',
  lastName: 'García',
  tenantName: 'Empresa XYZ',
});

if (result.mustChangePassword) {
  // Show password change form
}
```

---

### login()

Authenticates a user with email and password. Supports MFA flow.

```typescript
login(data: LoginData): Promise<AuthResponse>
```

**Parameters (`LoginData`):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | `string` | Yes | User email |
| `password` | `string` | Yes | User password |
| `targetApp` | `string` | No | Target app key for subscription validation |

**Returns:** `Promise<AuthResponse>`

When `requiresMfa` is `true`, the response includes a `tempToken` that must be used with `verifyMfa()`.

**Example:**

```typescript
const result = await auth.login({
  email: 'user@empresa.cl',
  password: 'Pass123!',
});

if (result.requiresMfa) {
  const code = prompt('Enter Google Authenticator code:');
  const session = await auth.verifyMfa(result.tempToken, code);
} else {
  console.log('Login successful:', result.user.email);
}
```

---

### verifyMfa()

Completes MFA verification after login returns `requiresMfa: true`.

```typescript
verifyMfa(tempToken: string, code: string): Promise<TGTSession | null>
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `tempToken` | `string` | Temporary token from login response |
| `code` | `string` | 6-digit code from Google Authenticator |

**Returns:** `Promise<TGTSession | null>`

**Example:**

```typescript
const session = await auth.verifyMfa('temp-token-abc', '123456');
if (session) {
  console.log('MFA verified, user:', session.user.email);
}
```

---

### logout()

Invalidates the token on the backend, clears localStorage, and redirects to login.

```typescript
logout(): Promise<void>
```

**Example:**

```typescript
await auth.logout();
// User is redirected to Identity login
```

---

## Session

### checkSession()

Validates the current session. If no valid session exists, **automatically redirects to login**.

Process:
1. Reads token from URL (if redirected from Identity)
2. Reads token from localStorage
3. Decodes JWT locally and validates structure
4. Validates token with backend (`/api/v1/auth/me`)
5. If invalid, redirects to login or `/blocked` (depending on error type)

```typescript
checkSession(): Promise<TGTSession | null>
```

**Returns:** `Promise<TGTSession | null>` — Session object if valid, `null` if redirecting.

**Example:**

```typescript
const session = await auth.checkSession();
if (session) {
  console.log('User:', session.user.email);
  console.log('Tenant:', session.tenantId);
  console.log('Roles:', session.user.roles);
}
```

---

### checkSessionSilent()

Checks session **without redirecting or executing callbacks**. Useful for public pages that show different content based on login status.

```typescript
checkSessionSilent(validateWithServer?: boolean): Promise<TGTSession | null>
```

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `validateWithServer` | `boolean` | `true` | If `true`, validates with `/api/v1/auth/me`. If `false`, only validates JWT locally (faster). |

**Returns:** `Promise<TGTSession | null>`

**Example:**

```typescript
const session = await auth.checkSessionSilent();
if (session) {
  showButton('Go to Dashboard', '/dashboard');
} else {
  showButton('Login', () => auth.redirectToLogin());
}

// Fast check without server validation
const localSession = await auth.checkSessionSilent(false);
```

---

### getSession()

Returns the current in-memory session without making any network request. Must call `checkSession()` first.

```typescript
getSession(): TGTSession | null
```

---

### getUser()

Returns the current in-memory user without making any network request.

```typescript
getUser(): TGTUser | null
```

---

### getTenantId()

Returns the tenant ID of the current session.

```typescript
getTenantId(): string | null
```

---

### getToken()

Returns the current JWT token from localStorage. Useful for injecting into API request headers.

```typescript
getToken(): string | null
```

---

### redirectToLogin()

Redirects to the Identity Provider login page.

```typescript
redirectToLogin(redirectUrl?: string): void
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `redirectUrl` | `string` | Optional. Full URL to return to after login. Only works if the host is in `allowedRedirectHosts`. |

**Example:**

```typescript
// Simple redirect
auth.redirectToLogin();

// With return URL
auth.redirectToLogin(window.location.href);
```

---

### isRedirectAllowed()

Checks if a URL's host is in the `allowedRedirectHosts` list.

```typescript
isRedirectAllowed(redirectUrl: string): boolean
```

**Example:**

```typescript
const url = 'https://tgtone.cl/precios';
if (auth.isRedirectAllowed(url)) {
  auth.redirectToLogin(url);
}
```

---

## Authorization

### hasRole()

Checks if the current user has a specific role in an application.

```typescript
hasRole(appName: string, roleName: string): boolean
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `appName` | `string` | Application name (e.g. `'console'`, `'zenith'`, `'baco'`) |
| `roleName` | `string` | Role name (e.g. `'admin'`, `'owner'`, `'viewer'`) |

**Example:**

```typescript
if (auth.hasRole('console', 'admin')) {
  // Show admin panel
}
```

---

### getRoles()

Returns all roles for the current user in a specific application.

```typescript
getRoles(appName: string): string[]
```

**Example:**

```typescript
const roles = auth.getRoles('console'); // ['owner', 'admin']
```

---

### hasAccessToApp()

Checks if the user has at least one role in the specified application.

```typescript
hasAccessToApp(appName: string): boolean
```

**Example:**

```typescript
if (auth.hasAccessToApp('zenith')) {
  // Show link to Zenith
}
```

---

## Heartbeat & Session Revocation

### startHeartbeat()

Starts periodic session validation. If the session is revoked (user deleted, tenant suspended, etc.), executes `onSessionRevoked` callback or redirects to `/blocked`.

```typescript
startHeartbeat(): void
```

**Behavior:**
- Default interval: 5 minutes (configurable via `heartbeatIntervalMs`)
- Set `heartbeatIntervalMs: 0` to disable
- Does nothing if already running

**Example:**

```typescript
auth.startHeartbeat();
```

---

### stopHeartbeat()

Stops the periodic session validation.

```typescript
stopHeartbeat(): void
```

---

### isHeartbeatActive()

Returns whether the heartbeat is currently running.

```typescript
isHeartbeatActive(): boolean
```

---

### getBlockedRedirectUrl()

Generates the URL for the blocked page based on the error code.

```typescript
getBlockedRedirectUrl(error: AuthError): string
```

**Error Code to Type Mapping:**

| Error Code | Blocked Type |
|------------|-------------|
| `USER_INACTIVE` | `user` |
| `USER_NOT_FOUND` | `user` |
| `TENANT_INACTIVE` | `tenant` |
| `APP_SUBSCRIPTION_LOCKED` | `subscription` |
| `TRIAL_EXPIRED` | `trial` |

**Example:**

```typescript
const url = auth.getBlockedRedirectUrl({
  code: 'TENANT_INACTIVE',
  message: 'Tenant suspended',
});
// https://identity.tgtone.cl/blocked?type=tenant&message=Tenant%20suspended
```

---

## Utilities

### isRevocationError()

Checks if an error code indicates session revocation.

```typescript
isRevocationError(code: AuthErrorCode): boolean
```

**Example:**

```typescript
import { isRevocationError } from '@tgtone/auth-sdk';

try {
  await api.call();
} catch (error) {
  const code = error.response?.data?.code;
  if (code && isRevocationError(code)) {
    console.log('Session revoked:', code);
  }
}
```

---

### REVOCATION_ERROR_CODES

Array of all revocation error codes.

```typescript
const REVOCATION_ERROR_CODES: AuthErrorCode[]
// ['TENANT_INACTIVE', 'USER_INACTIVE', 'USER_NOT_FOUND', 'APP_SUBSCRIPTION_LOCKED', 'TRIAL_EXPIRED']
```

---

## HTTP Interceptors

Module: `@tgtone/auth-sdk/interceptor`

### createAxiosInterceptor()

Attaches a response interceptor to an Axios instance that handles 401 authentication errors and session revocation.

```typescript
createAxiosInterceptor(
  axios: any,
  authClient: TGTAuthClient,
  config?: InterceptorConfig
): () => void
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `axios` | `any` | Axios instance |
| `authClient` | `TGTAuthClient` | Auth client instance |
| `config` | `InterceptorConfig` | Optional configuration |

**Returns:** Cleanup function to remove the interceptor.

**Example:**

```typescript
import { createAxiosInterceptor } from '@tgtone/auth-sdk/interceptor';

const api = axios.create({ baseURL: '/api' });
const removeInterceptor = createAxiosInterceptor(api, authClient, {
  handleRevoked: true,
  excludeUrls: ['/public/health'],
});

// To remove:
// removeInterceptor();
```

---

### createAuthFetch()

Returns a wrapped `fetch` function that automatically injects the `Authorization` header and handles 401 revocation errors.

```typescript
createAuthFetch(
  authClient: TGTAuthClient,
  config?: InterceptorConfig
): (url: string | URL, init?: RequestInit) => Promise<Response>
```

**Example:**

```typescript
import { createAuthFetch } from '@tgtone/auth-sdk/interceptor';

const authFetch = createAuthFetch(authClient, {
  handleRevoked: true,
  excludeUrls: ['/public/'],
});

// Use like native fetch — Authorization header is auto-injected
const response = await authFetch('/api/users');
const data = await response.json();
```

---

### handleAuthError()

Manual error handler for custom error handling scenarios.

```typescript
handleAuthError(
  error: { response?: { status?: number; data?: { code?: string; message?: string } } },
  authClient: TGTAuthClient,
  options?: { onRevoked?: (error: AuthError) => void }
): boolean
```

**Returns:** `true` if the error was a revocation error and was handled, `false` otherwise.

**Example:**

```typescript
import { handleAuthError } from '@tgtone/auth-sdk/interceptor';

try {
  await api.call();
} catch (error) {
  if (handleAuthError(error, authClient)) {
    return; // Error was handled
  }
  throw error; // Not an auth error
}
```

---

## React Hook

### useTGTAuth()

React hook for SSO authentication with automatic session management.

```typescript
useTGTAuth(config: UseTGTAuthConfig): UseTGTAuthResult
```

**Parameters (`UseTGTAuthConfig`):**

Extends `TGTAuthConfig` with:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enableHeartbeat` | `boolean` | `true` | Start heartbeat automatically after login |
| `showRevokedState` | `boolean` | `false` | Show revoked error in UI instead of redirecting |

**Returns (`UseTGTAuthResult`):**

| Field | Type | Description |
|-------|------|-------------|
| `session` | `TGTSession \| null` | Current session |
| `loading` | `boolean` | True while checking session |
| `logout` | `() => Promise<void>` | Logout function |
| `hasRole` | `(app, role) => boolean` | Role check |
| `getRoles` | `(app) => string[]` | Get all roles |
| `hasAccessToApp` | `(app) => boolean` | Access check |
| `tenantId` | `string \| null` | Current tenant ID |
| `authClient` | `TGTAuthClient` | Underlying client instance |
| `revokedError` | `AuthError \| null` | Revocation error (when `showRevokedState: true`) |
| `isHeartbeatActive` | `boolean` | Heartbeat running status |
| `startHeartbeat` | `() => void` | Start heartbeat manually |
| `stopHeartbeat` | `() => void` | Stop heartbeat manually |

**Example:**

```tsx
import { useTGTAuth } from '@tgtone/auth-sdk/react';

function App() {
  const { session, loading, logout, hasRole, revokedError } = useTGTAuth({
    identityUrl: 'https://identity.tgtone.cl',
    appDomain: 'zenith.tgtone.cl',
    appKey: 'zenith',
    enableHeartbeat: true,
  });

  if (loading) return <Spinner />;
  if (revokedError) return <RevokedPage error={revokedError} />;
  if (!session) return null; // Redirecting to login

  return (
    <Dashboard user={session.user}>
      {hasRole('zenith', 'admin') && <AdminPanel />}
      <button onClick={logout}>Logout</button>
    </Dashboard>
  );
}
```

---

## TypeScript Types

### TGTAuthConfig

```typescript
interface TGTAuthConfig {
  identityUrl: string;
  appDomain: string;
  appKey?: string;
  onAuthSuccess?: (session: TGTSession) => void;
  onAuthFailure?: (error?: AuthError) => void;
  onSessionRevoked?: (error: AuthError) => void;
  debug?: boolean;
  allowedRedirectHosts?: string[];
  heartbeatIntervalMs?: number;
}
```

### TGTSession

```typescript
interface TGTSession {
  user: TGTUser;
  tenantId: string;
  tenantName: string;
  expiresAt: Date;
}
```

### TGTUser

```typescript
interface TGTUser {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  tenant_id: string;
  tenant_name: string;
  roles: Record<string, string[]>;
}
```

### AuthError

```typescript
interface AuthError {
  code: AuthErrorCode;
  message: string;
}
```

### AuthErrorCode

```typescript
type AuthErrorCode =
  | 'TENANT_INACTIVE'
  | 'USER_INACTIVE'
  | 'USER_NOT_FOUND'
  | 'APP_SUBSCRIPTION_LOCKED'
  | 'TRIAL_EXPIRED';
```

### SignupData

```typescript
interface SignupData {
  email: string;
  password?: string;
  firstName: string;
  lastName: string;
  tenantName: string;
}
```

### LoginData

```typescript
interface LoginData {
  email: string;
  password: string;
  targetApp?: string;
}
```

### AuthResponse

```typescript
interface AuthResponse {
  token: string;
  accessToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
  mustChangePassword?: boolean;
  requiresMfa?: boolean;
  tempToken?: string;
  message?: string;
}
```

### SessionResponse

```typescript
interface SessionResponse {
  user: TGTUser;
}
```

### InterceptorConfig

```typescript
interface InterceptorConfig {
  handleRevoked?: boolean;
  onAuthError?: (error: AuthError) => void;
  excludeUrls?: string[];
}
```

### UseTGTAuthConfig

```typescript
interface UseTGTAuthConfig extends TGTAuthConfig {
  enableHeartbeat?: boolean;
  showRevokedState?: boolean;
}
```

### UseTGTAuthResult

```typescript
interface UseTGTAuthResult {
  session: TGTSession | null;
  loading: boolean;
  logout: () => Promise<void>;
  hasRole: (appName: string, roleName: string) => boolean;
  getRoles: (appName: string) => string[];
  hasAccessToApp: (appName: string) => boolean;
  tenantId: string | null;
  authClient: TGTAuthClient;
  revokedError: AuthError | null;
  isHeartbeatActive: boolean;
  startHeartbeat: () => void;
  stopHeartbeat: () => void;
}
```

---

**Version:** 1.4.4
**Last updated:** 2026-04-14
