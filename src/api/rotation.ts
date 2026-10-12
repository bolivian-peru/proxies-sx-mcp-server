/**
 * Rotation API Module
 * Endpoints for port rotation management
 */

import type { ApiClient } from './client.js';
import type {
  Port,
  RotateResult,
  RotationHistory,
  CanRotateResponse,
  UpdateRotationSettingsRequest,
} from './types.js';

export class RotationApi {
  constructor(private readonly client: ApiClient) {}

  /**
   * Move a port to another device
   * Required scope: ports:rotate
   */
  async rotate(portId: string): Promise<RotateResult> {
    return this.client.post<RotateResult>(`/v1/ports/${portId}/rotate`);
  }

  /**
   * Check if port can be rotated
   * Required scope: ports:read
   */
  async canRotate(portId: string): Promise<CanRotateResponse> {
    return this.client.get<CanRotateResponse>(`/v1/ports/${portId}/can-rotate`);
  }

  /**
   * Update rotation settings
   * Required scope: ports:write
   */
  async updateSettings(portId: string, settings: UpdateRotationSettingsRequest): Promise<Port> {
    return this.client.patch<Port>(`/v1/ports/${portId}/rotation-settings`, settings);
  }

  /**
   * Get rotation history for port
   * Required scope: ports:read
   */
  async getHistory(portId: string, limit: number): Promise<RotationHistory> {
    return this.client.get<RotationHistory>(`/v1/ports/${portId}/rotation-history`, { limit });
  }

  /**
   * Public rotation link of a port: GET it without authentication to rotate.
   * The only place this URL is built.
   */
  getRotationTokenUrl(baseUrl: string, rotationToken: string): string {
    return `${baseUrl.replace(/\/$/, '')}/v1/rotate/${rotationToken}`;
  }
}
