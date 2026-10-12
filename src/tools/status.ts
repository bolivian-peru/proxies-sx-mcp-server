/**
 * Status Tools
 * MCP tools for port status and connectivity checks
 */

import { z } from 'zod';
import { portIdSchema } from './ports.js';
import type { ProxiesApi } from '../api/index.js';
import { readOnly } from './annotations.js';

/**
 * Tool definitions for port status
 */
export const statusToolDefinitions = [
  {
    name: 'get_port_status',
    annotations: readOnly('Get Port Status'),
    description: 'Check whether a dedicated port is online, offline or expired. Scope ports:read.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        portId: {
          type: 'string',
          description: 'The port ID to check',
        },
      },
      required: ['portId'],
    },
  },
  {
    name: 'get_port_ip',
    annotations: readOnly('Get Port Server Address'),
    description: 'Get the server address a dedicated port listens on. The exit IP is never returned by the API: send a request through the port to see it. Scope ports:read.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        portId: {
          type: 'string',
          description: 'The port ID to check',
        },
      },
      required: ['portId'],
    },
  },
  {
    name: 'ping_port',
    annotations: readOnly('Ping Port'),
    description: 'Test that a dedicated port answers and measure its latency. Scope ports:read.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        portId: {
          type: 'string',
          description: 'The port ID to ping',
        },
      },
      required: ['portId'],
    },
  },
  {
    name: 'speed_test_port',
    annotations: readOnly('Speed Test Port'),
    description: 'Run a speed test through a dedicated port (download, upload, ping). Takes several seconds and uses a little metered traffic. Scope ports:read.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        portId: {
          type: 'string',
          description: 'The port ID to test',
        },
      },
      required: ['portId'],
    },
  },
] as const;

/**
 * Status tools handler
 */
export function createStatusToolHandlers(api: ProxiesApi) {
  return {
    async get_port_status(args: { portId: string }): Promise<string> {
      try {
        const status = await api.ports.getStatus(args.portId);
        return [
          `Port Status: ${status.status.toUpperCase()}`,
          `Active: ${status.isActive ? 'yes' : 'no'}`,
          `Last Checked: ${status.lastChecked}`,
          `Expires: ${new Date(status.expiresAt).toISOString()}`,
        ].join('\n');
      } catch (error) {
        throw new Error(`Failed to get port status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async get_port_ip(args: { portId: string }): Promise<string> {
      try {
        const ipInfo = await api.ports.getIp(args.portId);
        return [
          `Server address: ${ipInfo.serverIp || 'Unknown'}`,
          'Exit IP: not exposed by the API. Send a request through the port to see it.',
        ].join('\n');
      } catch (error) {
        throw new Error(`Failed to get port IP: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async ping_port(args: { portId: string }): Promise<string> {
      try {
        const result = await api.ports.ping(args.portId);

        if (!result.success) {
          return `Ping failed: ${result.error || 'Connection failed'}`;
        }

        const testTime = result.testTime ? new Date(result.testTime).toISOString() : new Date().toISOString();
        return `Ping successful!\nLatency: ${result.responseTime ?? 0}ms\nTested At: ${testTime}`;
      } catch (error) {
        throw new Error(`Failed to ping port: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async speed_test_port(args: { portId: string }): Promise<string> {
      try {
        const result = await api.ports.speedTest(args.portId);
        return [
          'Speed Test Results:',
          `  Download: ${result.downloadSpeed.toFixed(2)} Mbps`,
          `  Upload: ${result.uploadSpeed.toFixed(2)} Mbps`,
          `  Ping: ${result.ping}ms`,
          `  Tested At: ${result.testTime}`,
        ].join('\n');
      } catch (error) {
        throw new Error(`Failed to run speed test: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  };
}

/**
 * Zod schemas for validation
 */
export const statusSchemas = {
  get_port_status: z.object({
    portId: portIdSchema,
  }),
  get_port_ip: z.object({
    portId: portIdSchema,
  }),
  ping_port: z.object({
    portId: portIdSchema,
  }),
  speed_test_port: z.object({
    portId: portIdSchema,
  }),
};
