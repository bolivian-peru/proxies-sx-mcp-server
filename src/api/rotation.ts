/**
 * Rotation API Module
 * Endpoints for port rotation management
 */

import type { ApiClient } from './client.js';
import type {
  Port,
  RotationHistoryEntry,
  CanRotateResponse,
  UpdateRotationSettingsRequest,
  PaginatedResponse,
} from './types.js';

export class RotationApi {
  constructor(private readonly client: ApiClient) {}

  /**
   * Rotate port to new device
   * Required scope: ports:rotate
   */
  async rotate(portId: string): Promise<Port> {
    return this.client.post<Port>(`/v1/ports/${portId}/rotate`);
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
    return this.client.put<Port>(`/v1/ports/${portId}/rotation-settings`, settings);
  }

  /**
   * Get rotation history for port
   * Required scope: ports:read
   */
  async getHistory(portId: string, params?: {
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<RotationHistoryEntry>> {
    return this.client.get<PaginatedResponse<RotationHistoryEntry>>(`/v1/ports/${portId}/rotation-history`, {
      limit: params?.limit ?? 20,
      offset: params?.offset ?? 0,
    });
  }

  /**
   * Enable auto-rotation
   * Required scope: ports:write
   * @param portId - Port ID
   * @param intervalMinutes - Rotation interval in minutes (user-friendly input)
   */
  async enableAutoRotation(portId: string, intervalMinutes: number, options?: {
    matchCarrier?: boolean;
    matchCity?: boolean;
  }): Promise<Port> {
    // Convert minutes to seconds for the backend
    const intervalSeconds = intervalMinutes * 60;
    return this.updateSettings(portId, {
      enabled: true,
      intervalSeconds,
      matchCarrier: options?.matchCarrier,
      matchCity: options?.matchCity,
    });
  }

  /**
   * Disable auto-rotation
   * Required scope: ports:write
   */
  async disableAutoRotation(portId: string): Promise<Port> {
    return this.updateSettings(portId, { enabled: false });
  }

  /**
   * Get rotation token URL for public rotation API
   */
  getRotationTokenUrl(baseUrl: string, rotationToken: string): string {
    return `${baseUrl.replace(/\/$/, '')}/rotate/${rotationToken}`;
  }
}
