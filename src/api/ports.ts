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
  ExtendPortResult,
  MaxExtendHours,
  CreatePortRequest,
  UpdateCredentialsRequest,
  ReconfigurePortRequest,
} from './types.js';

export class PortsApi {
  constructor(private readonly client: ApiClient) {}

  /**
   * List the account's ports (the route takes no filters)
   * Required scope: ports:read
   */
  async list(): Promise<Port[]> {
    return this.client.get<Port[]>('/v1/ports');
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
   */
  async create(data: CreatePortRequest): Promise<Port> {
    return this.client.post<Port>('/v1/ports', data);
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
   * Reconfigure port to new location. Returns a NEW port: the old id is gone.
   * Required scope: ports:write (3 calls per 2 minutes)
   */
  async reconfigure(portId: string, data: ReconfigurePortRequest): Promise<Port> {
    return this.client.post<Port>(`/v1/ports/${portId}/reconfigure`, data);
  }

  /**
   * Get port online/offline status
   * Required scope: ports:read
   */
  async getStatus(portId: string): Promise<PortStatusInfo> {
    return this.client.get<PortStatusInfo>(`/v1/ports/${portId}/status`);
  }

  /**
   * Get the server address of a port (the exit IP is never returned)
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
    return this.client.get<SpeedTestResult>(`/v1/ports/${portId}/test-speed`);
  }

  /**
   * Extend a port's expiry (time is free)
   * Required scope: ports:write
   */
  async extend(portId: string, hours: number): Promise<ExtendPortResult> {
    return this.client.post<ExtendPortResult>(`/v1/ports/${portId}/extend-time`, { hours });
  }

  /**
   * Get how many hours a port can still be extended by
   * Required scope: ports:read
   */
  async getMaxExtendHours(portId: string): Promise<MaxExtendHours> {
    return this.client.get<MaxExtendHours>(`/v1/ports/${portId}/max-extend-hours`);
  }
}
