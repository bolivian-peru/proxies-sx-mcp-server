/**
 * Status Tools
 * MCP tools for port status and connectivity checks
 */

import { z } from 'zod';
import type { ProxiesApi } from '../api/index.js';

/**
 * Tool definitions for port status
 */
export const statusToolDefinitions = [
  {
    name: 'get_port_status',
    description: 'Check if a port is online or offline on the proxy server',
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
    description: 'Get the current public IP address of a port',
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
    description: 'Test the connectivity and latency of a port',
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
    description: 'Run a speed test on a port to measure download/upload speeds',
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
        const statusText = status.isOnline ? 'ONLINE' : 'OFFLINE';
        const lines = [
          `Port Status: ${statusText}`,
          `Last Checked: ${status.lastChecked}`,
        ];

        if (status.uptime !== undefined) {
          lines.push(`Uptime: ${status.uptime}s`);
        }
        if (status.deviceStatus) {
          lines.push(`Device Status: ${status.deviceStatus}`);
        }

        return lines.join('\n');
      } catch (error) {
        throw new Error(`Failed to get port status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async get_port_ip(args: { portId: string }): Promise<string> {
      try {
        const ipInfo = await api.ports.getIp(args.portId);
        // Backend returns { publicIp, serverIp }
        const lines = [
          `Public IP: ${ipInfo.publicIp || ipInfo.ip || 'Unknown'}`,
          `Server IP: ${ipInfo.serverIp || 'Unknown'}`,
        ];

        return lines.join('\n');
      } catch (error) {
        throw new Error(`Failed to get port IP: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async ping_port(args: { portId: string }): Promise<string> {
      try {
        const result = await api.ports.ping(args.portId);
        // Backend returns { success, ip, responseTime, testTime, error? }

        if (result.success) {
          const latency = result.responseTime || result.latencyMs || 0;
          const ip = result.ip || 'Unknown';
          const testTime = result.testTime ? new Date(result.testTime).toISOString() : new Date().toISOString();
          return `Ping successful!\nIP: ${ip}\nLatency: ${latency}ms\nTested At: ${testTime}`;
        } else {
          return `Ping failed: ${result.error || 'Connection failed'}`;
        }
      } catch (error) {
        throw new Error(`Failed to ping port: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async speed_test_port(args: { portId: string }): Promise<string> {
      try {
        const result = await api.ports.speedTest(args.portId);
        return [
          'Speed Test Results:',
          `  Download: ${result.downloadMbps.toFixed(2)} Mbps`,
          `  Upload: ${result.uploadMbps.toFixed(2)} Mbps`,
          `  Latency: ${result.latencyMs}ms`,
          `  Tested At: ${result.testedAt}`,
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
    portId: z.string().min(1),
  }),
  get_port_ip: z.object({
    portId: z.string().min(1),
  }),
  ping_port: z.object({
    portId: z.string().min(1),
  }),
  speed_test_port: z.object({
    portId: z.string().min(1),
  }),
};
