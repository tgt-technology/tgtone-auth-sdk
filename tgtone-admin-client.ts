/**
 * 🔐 TGT One Admin Client SDK (server-side)
 *
 * Cliente server-to-server para gestión de usuarios del identity core (Console).
 * A diferencia de TGTAuthClient (browser), este cliente NO usa localStorage,
 * window ni BroadcastChannel — puede correr en Node.js, Bun, cron jobs,
 * webhooks y backends Elysia/NestJS.
 *
 * Soporta dos modos de autenticación (exactamente uno requerido):
 *
 * 1. **token** (JWT de admin reenviado): para operaciones iniciadas por un
 *    admin logueado. El backend de la app recibe el JWT en el request del
 *    frontend y lo reenvía a Console.
 *
 * 2. **maintenanceKey** (MAINTENANCE_API_KEY): para operaciones sin usuario
 *    detrás (cron jobs, webhooks, sincronizaciones). Usa el header
 *    `x-maintenance-key`, patrón estándar del ecosistema TGT One.
 *
 * @example Backend reenviando JWT del admin:
 * ```typescript
 * import { TGTAdminClient } from '@tgtone/auth-sdk/server';
 *
 * const admin = new TGTAdminClient({
 *   coreApiUrl: process.env.CORE_API_URL!,
 *   token: request.headers.authorization?.slice(7),
 * });
 * const users = await admin.listUsers(tenantId);
 * ```
 *
 * @example Cron job / webhook con maintenance key:
 * ```typescript
 * const admin = new TGTAdminClient({
 *   coreApiUrl: process.env.CORE_API_URL!,
 *   maintenanceKey: process.env.MAINTENANCE_API_KEY!,
 * });
 * await admin.deleteUser(profileId);
 * ```
 */

import type {
  ApplicationAccess,
  ApplicationRoleInfo,
  InviteUserData,
  InviteUserResult,
  UpdateUserData,
  UpdateUserResult,
  UserActionResult,
  UserProfile,
  UserSummary,
} from './tgtone-auth-client';

// Re-exportar tipos compartidos para conveniencia de consumidores server-side
export type {
  ApplicationAccess,
  ApplicationRoleInfo,
  InviteUserData,
  InviteUserResult,
  UpdateUserData,
  UpdateUserResult,
  UserActionResult,
  UserApplicationAssignment,
  UserProfile,
  UserSummary,
} from './tgtone-auth-client';

// ============================================================================
// CONFIG
// ============================================================================

export interface TGTAdminConfig {
  /**
   * URL del Core API (sin trailing slash, sin /api).
   * @example 'https://core.tgtone.cl' o 'https://dev-core.tgtone.cl'
   */
  coreApiUrl: string;

  /**
   * JWT de un admin autenticado (Bearer token reenviado desde el request
   * del frontend). Usar para operaciones iniciadas por un usuario.
   * Mutuamente excluyente con maintenanceKey.
   */
  token?: string;

  /**
   * MAINTENANCE_API_KEY del ecosistema (header x-maintenance-key).
   * Usar para operaciones sin usuario: cron jobs, webhooks, sincronización.
   * Mutuamente excluyente con token.
   */
  maintenanceKey?: string;

  /**
   * Si es true, loguea requests en consola.
   * @default false
   */
  debug?: boolean;
}

// ============================================================================
// CLIENTE
// ============================================================================

export class TGTAdminClient {
  private config: Required<Pick<TGTAdminConfig, 'coreApiUrl' | 'debug'>> & TGTAdminConfig;
  private authHeaders: Record<string, string>;

  constructor(config: TGTAdminConfig) {
    if (!config.coreApiUrl) {
      throw new Error(
        'coreApiUrl es requerido. Ej: coreApiUrl: "https://core.tgtone.cl" (sin /api)',
      );
    }

    const hasToken = !!config.token?.trim();
    const hasKey = !!config.maintenanceKey?.trim();

    if (hasToken === hasKey) {
      throw new Error(
        'Se requiere exactamente uno de: token (JWT de admin) o maintenanceKey (MAINTENANCE_API_KEY). ' +
          (hasToken ? 'Se recibieron ambos.' : 'No se recibió ninguno.'),
      );
    }

    this.config = {
      ...config,
      coreApiUrl: config.coreApiUrl.replace(/\/api\/?$/, '').replace(/\/+$/, ''),
      debug: config.debug ?? false,
    };

    this.authHeaders = hasToken
      ? { Authorization: `Bearer ${config.token!.trim()}` }
      : { 'x-maintenance-key': config.maintenanceKey!.trim() };

    this.log('🔹 TGT Admin Client inicializado', {
      coreApiUrl: this.config.coreApiUrl,
      authMode: hasToken ? 'jwt' : 'maintenance-key',
    });
  }

  // ==========================================================================
  // MÉTODOS PÚBLICOS
  // ==========================================================================

  /**
   * Lista usuarios de un tenant con perfil, roles organizacionales y por app.
   */
  async listUsers(tenantId: string): Promise<UserProfile[]> {
    if (!tenantId) throw new Error('tenantId es requerido');
    return this.request('GET', `/api/v1/users?tenantId=${encodeURIComponent(tenantId)}`);
  }

  /**
   * Mapa userId → UserSummary para resolución rápida de nombres/emails.
   * Solo incluye usuarios activos.
   */
  async getUsersMap(tenantId: string): Promise<Record<string, UserSummary>> {
    const users = await this.listUsers(tenantId);
    const map: Record<string, UserSummary> = {};

    for (const u of users) {
      if (!u.isActive || u.deletedAt) continue;
      const displayName = [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email;
      map[u.userId] = {
        userId: u.userId,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        displayName,
        avatarUrl: u.avatarUrl,
        organizationalRole: u.organizationalRole,
        applications: u.applications,
      };
    }

    return map;
  }

  /**
   * Invita (crea) un usuario: asigna roles y envía email de invitación
   * con contraseña temporal.
   */
  async inviteUser(data: InviteUserData): Promise<InviteUserResult> {
    if (!data?.email) throw new Error('email es requerido');
    if (!data?.tenantId) throw new Error('tenantId es requerido');
    return this.request('POST', '/api/v1/users/invite', data);
  }

  /**
   * Actualiza perfil y/o roles de aplicación de un usuario.
   * applicationAccess es la lista COMPLETA (reemplaza los existentes).
   *
   * @param profileId - ID del perfil (campo `id` de UserProfile, NO el userId)
   */
  async updateUser(profileId: string, data: UpdateUserData): Promise<UpdateUserResult> {
    if (!profileId) throw new Error('profileId es requerido');
    return this.request('PUT', `/api/v1/users/${encodeURIComponent(profileId)}`, data);
  }

  /**
   * Desactiva un usuario (soft delete) y revoca sus sesiones.
   */
  async deleteUser(profileId: string): Promise<UserActionResult> {
    if (!profileId) throw new Error('profileId es requerido');
    return this.request('DELETE', `/api/v1/users/${encodeURIComponent(profileId)}`);
  }

  /**
   * Reactiva un usuario previamente desactivado.
   */
  async reactivateUser(profileId: string): Promise<UserActionResult> {
    if (!profileId) throw new Error('profileId es requerido');
    return this.request('PUT', `/api/v1/users/${encodeURIComponent(profileId)}/reactivate`);
  }

  /**
   * Reenvía el email de invitación (regenera contraseña temporal).
   */
  async resendInvitation(profileId: string): Promise<UserActionResult> {
    if (!profileId) throw new Error('profileId es requerido');
    return this.request('POST', `/api/v1/users/${encodeURIComponent(profileId)}/resend-invitation`);
  }

  /**
   * Roles disponibles de una aplicación (para dropdowns de asignación).
   */
  async getApplicationRoles(appId: string): Promise<ApplicationRoleInfo[]> {
    if (!appId) throw new Error('appId es requerido');
    return this.request('GET', `/api/v1/applications/${encodeURIComponent(appId)}/roles`);
  }

  // ==========================================================================
  // HELPERS PRIVADOS
  // ==========================================================================

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.config.coreApiUrl}${path}`;
    this.log(`🔹 ${method} ${path}`);

    const response = await fetch(url, {
      method,
      headers: {
        ...this.authHeaders,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Error en el servidor' }));
      throw new Error(error.message || `Error ${response.status}: ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  private log(...args: unknown[]): void {
    if (this.config.debug) {
      console.log('[TGT Admin]', ...args);
    }
  }
}
