/**
 * Port Tools
 * MCP tools for port management
 */

import { z } from 'zod';
import type { ProxiesApi } from '../api/index.js';
import { formatPortSummary, formatPortTable } from '../utils/formatting.js';

/**
 * Tool definitions for port management
 */
export const portToolDefinitions = [
  {
    name: 'list_ports',
    description: 'List all proxy ports with optional filters. Returns port names, types, status, locations, and expiration.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: ['shared', 'private'],
          description: 'Filter by port type',
        },
        status: {
          type: 'string',
          enum: ['active', 'suspended', 'expired'],
          description: 'Filter by port status',
        },
        countryId: {
          type: 'string',
          description: 'Filter by country ID',
        },
        carrierId: {
          type: 'string',
          description: 'Filter by carrier ID',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of ports to return (default: 50)',
        },
      },
      required: [] as string[],
    },
  },
  {
    name: 'get_port',
    description: 'Get detailed information about a specific port by ID',
    inputSchema: {
      type: 'object' as const,
      properties: {
        portId: {
          type: 'string',
          description: 'The port ID to retrieve',
        },
      },
      required: ['portId'],
    },
  },
  {
    name: 'create_port',
    description: 'Create a new proxy port in a specific country. Requires available slots and optionally carrier/city targeting.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        countryId: {
          type: 'string',
          description: 'Country ID for the port (use list_available_countries to get IDs)',
        },
        type: {
          type: 'string',
          enum: ['shared', 'private'],
          description: 'Port type (shared or private)',
        },
        carrierId: {
          type: 'string',
          description: 'Optional carrier ID for specific carrier targeting',
        },
        cityId: {
          type: 'string',
          description: 'Optional city ID for specific city targeting',
        },
        expiresInDays: {
          type: 'number',
          description: 'Port expiration in days (1-365, default: 30)',
        },
        osFingerprint: {
          type: 'string',
          enum: ['', 'windows:1', 'macosx:3', 'macosx:4', 'ios:2', 'ios:1', 'android:3', 'android:1'],
          description: 'Optional OS fingerprint spoofing',
        },
      },
      required: ['countryId', 'type'],
    },
  },
  {
    name: 'delete_port',
    description: 'Delete a proxy port by ID. This will remove the port from the proxy server.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        portId: {
          type: 'string',
          description: 'The port ID to delete',
        },
      },
      required: ['portId'],
    },
  },
  {
    name: 'update_port_credentials',
    description: 'Update the login and/or password for a proxy port',
    inputSchema: {
      type: 'object' as const,
      properties: {
        portId: {
          type: 'string',
          description: 'The port ID to update',
        },
        proxyLogin: {
          type: 'string',
          description: 'New proxy login username',
        },
        proxyPassword: {
          type: 'string',
          description: 'New proxy password',
        },
      },
      required: ['portId'],
    },
  },
  {
    name: 'update_os_fingerprint',
    description: 'Update the OS fingerprint (p0f) for a port to spoof the operating system',
    inputSchema: {
      type: 'object' as const,
      properties: {
        portId: {
          type: 'string',
          description: 'The port ID to update',
        },
        osFingerprint: {
          type: 'string',
          enum: ['', 'windows:1', 'macosx:3', 'macosx:4', 'ios:2', 'ios:1', 'android:3', 'android:1'],
          description: 'OS fingerprint value (empty string to disable)',
        },
      },
      required: ['portId', 'osFingerprint'],
    },
  },
  {
    name: 'reconfigure_port',
    description: 'Reconfigure a port to use a different location (country, carrier, city)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        portId: {
          type: 'string',
          description: 'The port ID to reconfigure',
        },
        countryId: {
          type: 'string',
          description: 'New country ID',
        },
        carrierId: {
          type: 'string',
          description: 'Optional new carrier ID',
        },
        cityId: {
          type: 'string',
          description: 'Optional new city ID',
        },
      },
      required: ['portId', 'countryId'],
    },
  },
] as const;

/**
 * Port tools handler
 */
export function createPortToolHandlers(api: ProxiesApi) {
  return {
    async list_ports(args: {
      type?: 'shared' | 'private';
      status?: 'active' | 'suspended' | 'expired';
      countryId?: string;
      carrierId?: string;
      limit?: number;
    }): Promise<string> {
      try {
        const result = await api.ports.list({
          type: args.type,
          status: args.status,
          countryId: args.countryId,
          carrierId: args.carrierId,
          limit: args.limit ?? 50,
        });

        if (result.data.length === 0) {
          return 'No ports found matching the criteria.';
        }

        const table = formatPortTable(result.data);
        return `Found ${result.total} ports (showing ${result.data.length}):\n\n${table}`;
      } catch (error) {
        throw new Error(`Failed to list ports: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async get_port(args: { portId: string }): Promise<string> {
      try {
        const port = await api.ports.get(args.portId);
        const summary = formatPortSummary(port);

        // Add connection strings for easy copy-paste
        const httpProxy = `http://${port.proxyLogin}:${port.proxyPassword}@${port.serverIp}:${port.httpPort}`;
        const socksProxy = `socks5://${port.proxyLogin}:${port.proxyPassword}@${port.serverIp}:${port.socksPort}`;

        return `${summary}\n\nConnection Strings (ready to use):\n  HTTP:   ${httpProxy}\n  SOCKS5: ${socksProxy}`;
      } catch (error) {
        throw new Error(`Failed to get port: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async create_port(args: {
      countryId: string;
      type: 'shared' | 'private';
      carrierId?: string;
      cityId?: string;
      expiresInDays?: number;
      osFingerprint?: string;
    }): Promise<string> {
      try {
        // Convert days to seconds (default 30 days)
        const days = args.expiresInDays ?? 30;
        const expiresAt = days * 24 * 60 * 60; // days to seconds

        const result = await api.ports.create({
          countryId: args.countryId,
          isPrivate: args.type === 'private',
          carrierId: args.carrierId,
          cityId: args.cityId,
          expiresAt,
          osFingerprint: args.osFingerprint,
        });

        // Backend may return { port: Port, message: string } or just Port directly
        const port = 'port' in result ? result.port : result;

        // Build connection strings for immediate use
        const httpProxy = `http://${port.proxyLogin}:${port.proxyPassword}@${port.serverIp}:${port.httpPort}`;
        const socksProxy = `socks5://${port.proxyLogin}:${port.proxyPassword}@${port.serverIp}:${port.socksPort}`;

        return `Port created successfully!\n\n${formatPortSummary(port)}\n\nConnection Strings (ready to use):\n  HTTP:   ${httpProxy}\n  SOCKS5: ${socksProxy}`;
      } catch (error) {
        throw new Error(`Failed to create port: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async delete_port(args: { portId: string }): Promise<string> {
      try {
        const result = await api.ports.delete(args.portId);
        return result.message || `Port ${args.portId} deleted successfully.`;
      } catch (error) {
        throw new Error(`Failed to delete port: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async update_port_credentials(args: {
      portId: string;
      proxyLogin?: string;
      proxyPassword?: string;
    }): Promise<string> {
      try {
        if (!args.proxyLogin && !args.proxyPassword) {
          throw new Error('At least one of proxyLogin or proxyPassword must be provided');
        }

        const port = await api.ports.updateCredentials(args.portId, {
          proxyLogin: args.proxyLogin,
          proxyPassword: args.proxyPassword,
        });

        return `Credentials updated successfully!\n\nNew credentials:\n  Login: ${port.proxyLogin}\n  Password: ${port.proxyPassword}`;
      } catch (error) {
        throw new Error(`Failed to update credentials: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async update_os_fingerprint(args: {
      portId: string;
      osFingerprint: string;
    }): Promise<string> {
      try {
        const port = await api.ports.updateOsFingerprint(args.portId, args.osFingerprint);
        const fingerprint = port.osFingerprint || 'None (disabled)';
        return `OS fingerprint updated to: ${fingerprint}`;
      } catch (error) {
        throw new Error(`Failed to update OS fingerprint: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async reconfigure_port(args: {
      portId: string;
      countryId: string;
      carrierId?: string;
      cityId?: string;
    }): Promise<string> {
      try {
        const port = await api.ports.reconfigure(args.portId, {
          countryId: args.countryId,
          carrierId: args.carrierId,
          cityId: args.cityId,
        });

        return `Port reconfigured successfully!\n\n${formatPortSummary(port)}`;
      } catch (error) {
        throw new Error(`Failed to reconfigure port: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  };
}

/**
 * Zod schemas for validation
 */
export const portSchemas = {
  list_ports: z.object({
    type: z.enum(['shared', 'private']).optional(),
    status: z.enum(['active', 'suspended', 'expired']).optional(),
    countryId: z.string().optional(),
    carrierId: z.string().optional(),
    limit: z.number().min(1).max(100).optional(),
  }),
  get_port: z.object({
    portId: z.string().min(1),
  }),
  create_port: z.object({
    countryId: z.string().min(1),
    type: z.enum(['shared', 'private']),
    carrierId: z.string().optional(),
    cityId: z.string().optional(),
    expiresInDays: z.number().min(1).max(365).optional(),
    osFingerprint: z.enum(['', 'windows:1', 'macosx:3', 'macosx:4', 'ios:2', 'ios:1', 'android:3', 'android:1']).optional(),
  }),
  delete_port: z.object({
    portId: z.string().min(1),
  }),
  update_port_credentials: z.object({
    portId: z.string().min(1),
    proxyLogin: z.string().optional(),
    proxyPassword: z.string().optional(),
  }),
  update_os_fingerprint: z.object({
    portId: z.string().min(1),
    osFingerprint: z.enum(['', 'windows:1', 'macosx:3', 'macosx:4', 'ios:2', 'ios:1', 'android:3', 'android:1']),
  }),
  reconfigure_port: z.object({
    portId: z.string().min(1),
    countryId: z.string().min(1),
    carrierId: z.string().optional(),
    cityId: z.string().optional(),
  }),
};
