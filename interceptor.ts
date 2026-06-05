/**
 * 🔐 HTTP Interceptor para TGT One Auth
 * 
 * Interceptor para Axios y Fetch API que maneja automáticamente
 * errores de autenticación (401) y sesión revocada.
 * 
 * @example
 * ```typescript
 * // Con Axios
 * import { createAxiosInterceptor } from 'tgtone-auth-client/interceptor';
 * 
 * const api = axios.create({ baseURL: '/api' });
 * createAxiosInterceptor(api, authClient);
 * 
 * // Con Fetch
 * import { createAuthFetch } from 'tgtone-auth-client/interceptor';
 * 
 * const authFetch = createAuthFetch(authClient);
 * const response = authFetch('/api/data');
 * ```
 */

import { TGTAuthClient, AuthError, AuthErrorCode, isRevocationError } from './tgtone-auth-client';

// ============================================================================
// TIPOS
// ============================================================================

/**
 * Interfaz mínima de Axios que el interceptor necesita.
 * Evita depender de tipos de Axios directamente (es peer-level).
 * Compatible con axios ^0.x, ^1.x y cualquier instancia compatible.
 */
interface AxiosLike {
  interceptors: {
    response: {
      use(
        onFulfilled: (response: unknown) => unknown,
        onRejected: (error: AxiosErrorLike) => unknown,
      ): number;
      eject(id: number): void;
    };
  };
  request(config: AxiosRequestConfigLike): Promise<unknown>;
}

interface AxiosRequestConfigLike {
  url?: string;
  headers?: Record<string, string>;
  [key: string]: unknown;
}

interface AxiosErrorLike {
  response?: {
    status?: number;
    data?: { code?: string; message?: string };
  };
  config?: AxiosRequestConfigLike;
}

export interface InterceptorConfig {
  /**
   * Si es true, maneja automáticamente errores de sesión revocada.
   * Por defecto true.
   */
  handleRevoked?: boolean;
  
  /**
   * Callback personalizado para errores de autenticación.
   * Si se proporciona, se llama en lugar del comportamiento por defecto.
   */
  onAuthError?: (error: AuthError) => void;
  
  /**
   * URLs a excluir del interceptor (no se manejan errores).
   * Útil para endpoints públicos.
   */
  excludeUrls?: string[];
}

// ============================================================================
// AXIOS INTERCEPTOR
// ============================================================================

/**
 * Crea un interceptor de respuesta para Axios que maneja errores de autenticación.
 * 
 * @param axios Instancia de Axios
 * @param authClient Cliente de autenticación TGT
 * @param config Configuración del interceptor
 * @returns Función para remover el interceptor
 * 
 * @example
 * ```typescript
 * import axios from 'axios';
 * import { createAxiosInterceptor } from 'tgtone-auth-client/interceptor';
 * 
 * const api = axios.create({ baseURL: '/api' });
 * const removeInterceptor = createAxiosInterceptor(api, authClient, {
 *   handleRevoked: true,
 *   excludeUrls: ['/public/health'],
 * });
 * 
 * // Para remover el interceptor
 * // removeInterceptor();
 * ```
 */
export function createAxiosInterceptor(
  axios: AxiosLike,
  authClient: TGTAuthClient,
  config: InterceptorConfig = {}
): () => void {
  const { handleRevoked = true, onAuthError, excludeUrls = [] } = config;

  const interceptorId = axios.interceptors.response.use(
    (response: unknown) => response,
    async (error: AxiosErrorLike) => {
      // Si no hay respuesta, rechazar normalmente
      if (!error.response) {
        return Promise.reject(error);
      }

      const { status, data } = error.response;
      const requestUrl = error.config?.url || '';

      // Verificar si la URL está excluida
      const isExcluded = excludeUrls.some(url => requestUrl.includes(url));
      if (isExcluded) {
        return Promise.reject(error);
      }

      // Manejar errores 401
      if (status === 401) {
        // Intentar refresh automático si el token expiró
        if (data?.code === 'TOKEN_EXPIRED') {
          const refreshed = await authClient.refreshAccessToken();
          if (refreshed) {
            const newToken = authClient.getToken();
            if (newToken && error.config) {
              const retryConfig = {
                ...error.config,
                headers: {
                  ...error.config.headers,
                  Authorization: `Bearer ${newToken}`,
                },
              };
              return axios.request(retryConfig);
            }
          }
        }

        const authError: AuthError | undefined = data?.code && data?.message
          ? {
              code: data.code as AuthErrorCode,
              message: data.message,
            }
          : undefined;

        // Si es un error de revocación y está habilitado el manejo
        if (authError && isRevocationError(authError.code) && handleRevoked) {
          // Detener heartbeat si está corriendo
          authClient.stopHeartbeat();

          // Si hay callback personalizado, usarlo
          if (onAuthError) {
            onAuthError(authError);
          } else {
            // Comportamiento por defecto: redirigir a blocked
            const blockedUrl = authClient.getBlockedRedirectUrl(authError);
            window.location.href = blockedUrl;
          }
        }
      }

      return Promise.reject(error);
    }
  );

  // Retornar función para remover el interceptor
  return () => {
    axios.interceptors.response.eject(interceptorId);
  };
}

// ============================================================================
// FETCH INTERCEPTOR
// ============================================================================

/**
 * Crea una función fetch que incluye automáticamente el token de autenticación
 * y maneja errores de sesión revocada.
 * 
 * @param authClient Cliente de autenticación TGT
 * @param config Configuración del interceptor
 * @returns Función fetch mejorada
 * 
 * @example
 * ```typescript
 * import { createAuthFetch } from 'tgtone-auth-client/interceptor';
 * 
 * const authFetch = createAuthFetch(authClient);
 * 
 * // Uso igual que fetch nativo
 * const response = await authFetch('/api/data');
 * const data = await response.json();
 * ```
 */
export function createAuthFetch(
  authClient: TGTAuthClient,
  config: InterceptorConfig = {}
): (url: string | URL, init?: RequestInit) => Promise<Response> {
  const { handleRevoked = true, onAuthError, excludeUrls = [] } = config;

  return async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const urlString = url.toString();
    
    const token = authClient.getToken();
    const headers = new Headers(init?.headers);
    
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    let response = await fetch(url, {
      ...init,
      headers,
    });

    const isExcluded = excludeUrls.some(excludedUrl => urlString.includes(excludedUrl));
    if (isExcluded) {
      return response;
    }

    if (response.status === 401) {
      try {
        const clonedResponse = response.clone();
        const errorData = await clonedResponse.json();
        
        if (errorData?.code === 'TOKEN_EXPIRED') {
          const refreshed = await authClient.refreshAccessToken();
          if (refreshed) {
            const newToken = authClient.getToken();
            if (newToken) {
              const retryHeaders = new Headers(init?.headers);
              retryHeaders.set('Authorization', `Bearer ${newToken}`);
              response = await fetch(url, {
                ...init,
                headers: retryHeaders,
              });
              return response;
            }
          }
        }

        if (errorData?.code && errorData?.message) {
          const authError: AuthError = {
            code: errorData.code as AuthErrorCode,
            message: errorData.message,
          };

          if (isRevocationError(authError.code) && handleRevoked) {
            authClient.stopHeartbeat();

            if (onAuthError) {
              onAuthError(authError);
            } else {
              const blockedUrl = authClient.getBlockedRedirectUrl(authError);
              window.location.href = blockedUrl;
            }
          }
        }
      } catch {
        // No se pudo parsear el error, continuar normalmente
      }
    }

    return response;
  };
}

// ============================================================================
// UTILIDADES
// ============================================================================

/**
 * Helper para manejar errores de autenticación en callbacks personalizados.
 * 
 * @example
 * ```typescript
 * import { handleAuthError } from 'tgtone-auth-client/interceptor';
 * 
 * try {
 *   await api.call();
 * } catch (error) {
 *   if (handleAuthError(error, authClient)) {
 *     // El error fue manejado (sesión revocada)
 *     return;
 *   }
 *   // Otro tipo de error
 *   throw error;
 * }
 * ```
 */
export function handleAuthError(
  error: AxiosErrorLike,
  authClient: TGTAuthClient,
  options: { onRevoked?: (error: AuthError) => void } = {}
): boolean {
  if (!error.response || error.response.status !== 401) {
    return false;
  }

  const { data } = error.response;
  if (!data?.code || !data?.message) {
    return false;
  }

  const authError: AuthError = {
    code: data.code as AuthErrorCode,
    message: data.message,
  };

  if (isRevocationError(authError.code)) {
    authClient.stopHeartbeat();
    
    if (options.onRevoked) {
      options.onRevoked(authError);
    } else {
      const blockedUrl = authClient.getBlockedRedirectUrl(authError);
      window.location.href = blockedUrl;
    }
    
    return true;
  }

  return false;
}

export default {
  createAxiosInterceptor,
  createAuthFetch,
  handleAuthError,
};