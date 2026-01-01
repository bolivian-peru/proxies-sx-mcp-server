/**
 * Ports API Module
 * Endpoints for port management
 */

import type { ApiClient } from './client.js';
import type {
  Port,
  PortStatusInfo,
  PortIp,
  PingResult,
  SpeedTestResult,
  CreatePortRequest,
  CreatePortResponse,
  UpdateCredentialsRequest,
  ReconfigurePortRequest,
  OsFingerprintOption,
  PaginatedResponse,
} from './types.js';

export interface ListPortsParams {
  page?: number;
  limit?: number;
  type?: 'shared' | 'private';
  status?: 'active' | 'suspended' | 'expired';
  countryId?: string;
  carrierId?: string;
}

export class PortsApi {
  constructor(private readonly client: ApiClient) {}

  /**
   * List all ports with optional filters
   * Required scope: ports:read
   */
  async list(params?: ListPortsParams): Promise<PaginatedResponse<Port>> {
    const result = await this.client.get<PaginatedResponse<Port> | Port[]>('/v1/ports', {
      page: params?.page ?? 1,
      limit: params?.limit ?? 50,
      type: params?.type,
      status: params?.status,
      countryId: params?.countryId,
      carrierId: params?.carrierId,
    });

    // Handle both plain array and paginated response formats
    if (Array.isArray(result)) {
      return {
        data: result,
        total: result.length,
        page: 1,
        limit: params?.limit ?? 50,
        totalPages: 1,
      };
    }
    return result;
  }

  /**
   * Get port by ID
   * Required scope: ports:read
   */
  async get(portId: string): Promise<Port> {
    return this.client.get<Port>(`/v1/ports/${portId}`);
  }

  /**
   * Create new port
   * Required scope: ports:write
   * Note: Backend may return Port directly or wrapped in { port: Port, message: string }
   */
  async create(data: CreatePortRequest): Promise<CreatePortResponse | Port> {
    return this.client.post<CreatePortResponse | Port>('/v1/ports', data);
  }

  /**
   * Delete port
   * Required scope: ports:write
   */
  async delete(portId: string): Promise<{ message: string }> {
    return this.client.delete<{ message: string }>(`/v1/ports/${portId}`);
  }

  /**
   * Update port credentials (login/password)
   * Required scope: ports:write
   */
  async updateCredentials(portId: string, data: UpdateCredentialsRequest): Promise<Port> {
    return this.client.put<Port>(`/v1/ports/${portId}/credentials`, data);
  }

  /**
   * Update OS fingerprint
   * Required scope: ports:write
   */
  async updateOsFingerprint(portId: string, osFingerprint: string): Promise<Port> {
    return this.client.patch<Port>(`/v1/ports/${portId}/os-fingerprint`, {
      osFingerprint,
    });
  }

  /**
   * Get available OS fingerprints
   * Required scope: ports:read
   */
  async getOsFingerprints(portId: string): Promise<OsFingerprintOption[]> {
    return this.client.get<OsFingerprintOption[]>(`/v1/ports/${portId}/os-fingerprints`);
  }

  /**
   * Reconfigure port to new location
   * Required scope: ports:write
   */
  async reconfigure(portId: string, data: ReconfigurePortRequest): Promise<Port> {
    return this.client.put<Port>(`/v1/ports/${portId}/reconfigure`, data);
  }

  /**
   * Get port online/offline status
   * Required scope: ports:read
   */
  async getStatus(portId: string): Promise<PortStatusInfo> {
    return this.client.get<PortStatusInfo>(`/v1/ports/${portId}/status`);
  }

  /**
   * Get current public IP of port
   * Required scope: ports:read
   */
  async getIp(portId: string): Promise<PortIp> {
    return this.client.get<PortIp>(`/v1/ports/${portId}/ip`);
  }

  /**
   * Ping port to test connectivity
   * Required scope: ports:read
   */
  async ping(portId: string): Promise<PingResult> {
    return this.client.get<PingResult>(`/v1/ports/${portId}/ping`);
  }

  /**
   * Run speed test on port
   * Required scope: ports:read
   */
  async speedTest(portId: string): Promise<SpeedTestResult> {
    return this.client.get<SpeedTestResult>(`/v1/ports/${portId}/speed-test`);
  }
}
