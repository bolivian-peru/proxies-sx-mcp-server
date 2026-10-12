/**
 * Utility Tools
 * MCP tools for generating connection strings and helpers
 */

import { z } from 'zod';
import { portIdSchema } from './ports.js';
import type { ProxiesApi } from '../api/index.js';
import { buildProxyConnectionString } from '../utils/formatting.js';
import { readOnly } from './annotations.js';

/**
 * Tool definitions for utilities
 */
export const utilityToolDefinitions = [
  {
    name: 'get_proxy_connection_string',
    annotations: readOnly('Get Proxy Connection String'),
    description: 'Build the HTTP or SOCKS5 connection string of a dedicated port (contains the port password). For the Pool Gateway use pool_build_proxy_url instead. Scope ports:read.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        portId: {
          type: 'string',
          description: 'The port ID to generate connection string for',
        },
        protocol: {
          type: 'string',
          enum: ['http', 'socks5'],
          description: 'Protocol to use (default: http)',
        },
        serverHost: {
          type: 'string',
          description: 'Optional host to use instead of the server address stored on the port',
        },
      },
      required: ['portId'],
    },
  },
  {
    name: 'get_all_proxy_formats',
    annotations: readOnly('Get All Proxy Formats'),
    description: 'Get a dedicated port in every common format: URLs, host:port, environment variables, curl, Python and Node.js snippets, and its public rotation link. Scope ports:read.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        portId: {
          type: 'string',
          description: 'The port ID to generate formats for',
        },
        serverHost: {
          type: 'string',
          description: 'Optional host to use instead of the server address stored on the port',
        },
      },
      required: ['portId'],
    },
  },
  {
    name: 'get_service_status',
    annotations: readOnly('Get Service Status'),
    description: 'Check whether Proxies.sx is healthy right now: open Pool Gateway incidents, the state of the API, gateway and relay, and recent uptime. No account needed. Call it when requests fail with 5xx or E_INTERNAL before retrying in a loop.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: 'get_os_fingerprint_options',
    annotations: readOnly('Get OS Fingerprint Options'),
    description: 'List the OS fingerprint values create_port and update_os_fingerprint accept.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  },
] as const;

/**
 * Utility tools handler
 */
export function createUtilityToolHandlers(api: ProxiesApi, baseUrl: string) {
  return {
    async get_proxy_connection_string(args: {
      portId: string;
      protocol?: 'http' | 'socks5';
      serverHost?: string;
    }): Promise<string> {
      try {
        const port = await api.ports.get(args.portId);
        const protocol = args.protocol ?? 'http';
        const host = args.serverHost || port.serverIp;
        const connectionString = buildProxyConnectionString(port, host, protocol);

        return [
          `Proxy Connection String (${protocol.toUpperCase()}):`,
          '',
          connectionString,
          '',
          'Individual components:',
          `  Protocol: ${protocol}`,
          `  Host: ${host}`,
          `  Port: ${protocol === 'http' ? port.httpPort : port.socksPort}`,
          `  Username: ${port.proxyLogin}`,
          `  Password: ${port.proxyPassword}`,
        ].join('\n');
      } catch (error) {
        throw new Error(`Failed to generate connection string: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async get_all_proxy_formats(args: {
      portId: string;
      serverHost?: string;
    }): Promise<string> {
      try {
        const port = await api.ports.get(args.portId);
        const host = args.serverHost || port.serverIp;

        const httpUrl = buildProxyConnectionString(port, host, 'http');
        const socksUrl = buildProxyConnectionString(port, host, 'socks5');

        const lines = [
          'Proxy Connection Formats:',
          '',
          '--- HTTP Proxy ---',
          `URL: ${httpUrl}`,
          `Host:Port: ${host}:${port.httpPort}`,
          `Credentials: ${port.proxyLogin}:${port.proxyPassword}`,
          '',
          '--- SOCKS5 Proxy ---',
          `URL: ${socksUrl}`,
          `Host:Port: ${host}:${port.socksPort}`,
          `Credentials: ${port.proxyLogin}:${port.proxyPassword}`,
          '',
          '--- Environment Variables ---',
          `HTTP_PROXY=${httpUrl}`,
          `HTTPS_PROXY=${httpUrl}`,
          `ALL_PROXY=${socksUrl}`,
          '',
          '--- curl Examples ---',
          `curl -x ${httpUrl} https://api.ipify.org`,
          `curl --socks5 ${host}:${port.socksPort} --proxy-user ${port.proxyLogin}:${port.proxyPassword} https://api.ipify.org`,
          '',
          '--- Python (requests) ---',
          `proxies = {"http": "${httpUrl}", "https": "${httpUrl}"}`,
          '',
          '--- Node.js (axios) ---',
          `proxy: { host: "${host}", port: ${port.httpPort}, auth: { username: "${port.proxyLogin}", password: "${port.proxyPassword}" } }`,
        ];

        // Add rotation URL if available
        if (port.rotationToken) {
          const rotationUrl = api.rotation.getRotationTokenUrl(baseUrl, port.rotationToken);
          lines.push('');
          lines.push('--- Rotation URL ---');
          lines.push(`GET ${rotationUrl}`);
        }

        return lines.join('\n');
      } catch (error) {
        throw new Error(`Failed to generate proxy formats: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async get_service_status(): Promise<string> {
      try {
        const [active, status] = await Promise.all([
          api.client.get<{ incidents: unknown[] }>('/v1/gateway/incidents'),
          api.client.get<{ overall: string; components: unknown; uptime: unknown; incidents: unknown[] }>('/v1/x402/status'),
        ]);

        return JSON.stringify({
          overall: status.overall,
          openIncidents: active.incidents,
          components: status.components,
          uptimePercent: status.uptime,
          pastIncidents: status.incidents,
        }, null, 2);
      } catch (error) {
        throw new Error(`Failed to get service status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async get_os_fingerprint_options(): Promise<string> {
      const options = [
        { value: 'windows:1', label: 'Windows 10', description: 'Appear as Windows 10 device' },
        { value: 'macosx:3', label: 'macOS', description: 'Appear as macOS device' },
        { value: 'macosx:4', label: 'macOS (iPhone)', description: 'Appear as macOS via iPhone' },
        { value: 'ios:2', label: 'iOS (Real)', description: 'Real iOS device fingerprint' },
        { value: 'ios:1', label: 'iOS (p0f)', description: 'iOS p0f fingerprint' },
        { value: 'android:3', label: 'Android (Real)', description: 'Real Android device fingerprint' },
        { value: 'android:1', label: 'Android (p0f)', description: 'Android p0f fingerprint' },
      ];

      const lines = ['Available OS Fingerprint Options:', ''];

      for (const opt of options) {
        lines.push(`Value: "${opt.value}" - ${opt.label}`);
        lines.push(`  ${opt.description}`);
        lines.push('');
      }

      lines.push('Usage: update_os_fingerprint(portId, osFingerprint), or osFingerprint on create_port.');
      lines.push('Leave it out on create_port for no fingerprint; the API cannot clear one later.');

      return lines.join('\n');
    },
  };
}

/**
 * Zod schemas for validation
 */
export const utilitySchemas = {
  get_proxy_connection_string: z.object({
    portId: portIdSchema,
    protocol: z.enum(['http', 'socks5']).optional(),
    serverHost: z.string().min(1).optional(),
  }),
  get_all_proxy_formats: z.object({
    portId: portIdSchema,
    serverHost: z.string().min(1).optional(),
  }),
  get_service_status: z.object({}),
  get_os_fingerprint_options: z.object({}),
};
