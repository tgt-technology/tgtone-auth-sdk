/**
 * 🔐 TGT One Auth Client SDK v3
 * Exportaciones principales del paquete
 */

// Cliente principal
export { TGTAuthClient, isRevocationError, REVOCATION_ERROR_CODES } from './tgtone-auth-client';

// PKCE Utilities (v3)
export { generatePKCE, generatePKCEFallback } from './pkce';
export type { PKCEParams } from './pkce';

// Hook de React
export { useTGTAuth } from './react-hook';

// Interceptor HTTP
export { createAxiosInterceptor, createAuthFetch, handleAuthError } from './interceptor';
export type { InterceptorConfig } from './interceptor';

// Tipos TypeScript
export type {
  TGTUser,
  TGTSession,
  TGTAuthConfig,
  SessionResponse,
  AuthErrorCode,
  AuthError,
  SignupData,
  LoginData,
  AuthResponse,
  UserPermissions,
  AppPermissionDetail,
  PermissionsStructure,
  PermissionModules,
} from './tgtone-auth-client';

export type { UseTGTAuthResult, UseTGTAuthConfig } from './react-hook';
