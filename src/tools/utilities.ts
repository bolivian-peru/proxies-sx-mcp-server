/**
 * Utility Tools
 * MCP tools for generating connection strings and helpers
 */

import { z } from 'zod';
import type { ProxiesApi } from '../api/index.js';
import { buildProxyConnectionString } from '../utils/formatting.js';

/**
 * Tool definitions for utilities
 */
export const utilityToolDefinitions = [
  {
    name: 'get_proxy_connection_string',
    description: 'Generate a ready-to-use proxy connection string for a port (HTTP or SOCKS5)',
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
          description: 'The proxy server hostname (required)',
        },
      },
      required: ['portId', 'serverHost'],
    },
  },
  {
    name: 'get_all_proxy_formats',
    description: 'Get all common proxy formats for a port (useful for different applications)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        portId: {
          type: 'string',
          description: 'The port ID to generate formats for',
        },
        serverHost: {
          type: 'string',
          description: 'The proxy server hostname (required)',
        },
      },
      required: ['portId', 'serverHost'],
    },
  },
  {
    name: 'get_os_fingerprint_options',
    description: 'Get available OS fingerprint options for spoofing',
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
      serverHost: string;
    }): Promise<string> {
      try {
        const port = await api.ports.get(args.portId);
        const protocol = args.protocol ?? 'http';
        const connectionString = buildProxyConnectionString(port, args.serverHost, protocol);

        return [
          `Proxy Connection String (${protocol.toUpperCase()}):`,
          '',
          connectionString,
          '',
          'Individual components:',
          `  Protocol: ${protocol}`,
          `  Host: ${args.serverHost}`,
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
      serverHost: string;
    }): Promise<string> {
      try {
        const port = await api.ports.get(args.portId);

        const httpUrl = buildProxyConnectionString(port, args.serverHost, 'http');
        const socksUrl = buildProxyConnectionString(port, args.serverHost, 'socks5');

        const lines = [
          'Proxy Connection Formats:',
          '',
          '--- HTTP Proxy ---',
          `URL: ${httpUrl}`,
          `Host:Port: ${args.serverHost}:${port.httpPort}`,
          `Credentials: ${port.proxyLogin}:${port.proxyPassword}`,
          '',
          '--- SOCKS5 Proxy ---',
          `URL: ${socksUrl}`,
          `Host:Port: ${args.serverHost}:${port.socksPort}`,
          `Credentials: ${port.proxyLogin}:${port.proxyPassword}`,
          '',
          '--- Environment Variables ---',
          `HTTP_PROXY=${httpUrl}`,
          `HTTPS_PROXY=${httpUrl}`,
          `ALL_PROXY=${socksUrl}`,
          '',
          '--- curl Examples ---',
          `curl -x ${httpUrl} https://api.ipify.org`,
          `curl --socks5 ${args.serverHost}:${port.socksPort} --proxy-user ${port.proxyLogin}:${port.proxyPassword} https://api.ipify.org`,
          '',
          '--- Python (requests) ---',
          `proxies = {"http": "${httpUrl}", "https": "${httpUrl}"}`,
          '',
          '--- Node.js (axios) ---',
          `proxy: { host: "${args.serverHost}", port: ${port.httpPort}, auth: { username: "${port.proxyLogin}", password: "${port.proxyPassword}" } }`,
        ];

        // Add rotation URL if available
        if (port.rotationToken) {
          const rotationUrl = `${baseUrl.replace(/\/$/, '')}/rotate/${port.rotationToken}`;
          lines.push('');
          lines.push('--- Rotation URL ---');
          lines.push(`GET ${rotationUrl}`);
        }

        return lines.join('\n');
      } catch (error) {
        throw new Error(`Failed to generate proxy formats: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async get_os_fingerprint_options(): Promise<string> {
      const options = [
        { value: '', label: 'None', description: 'No OS fingerprint spoofing (default)' },
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

      lines.push('Usage: update_os_fingerprint(portId, osFingerprint)');

      return lines.join('\n');
    },
  };
}

/**
 * Zod schemas for validation
 */
export const utilitySchemas = {
  get_proxy_connection_string: z.object({
    portId: z.string().min(1),
    protocol: z.enum(['http', 'socks5']).optional(),
    serverHost: z.string().min(1),
  }),
  get_all_proxy_formats: z.object({
    portId: z.string().min(1),
    serverHost: z.string().min(1),
  }),
  get_os_fingerprint_options: z.object({}),
};
