/**
 * Port Tools
 * MCP tools for dedicated ports: one port bound to one carrier modem.
 * Modems exist only in US, GB, FR, NL, PL and GE (Georgia); every other
 * country is served by the Pool Gateway tools.
 */

import { z } from 'zod';
import type { ProxiesApi } from '../api/index.js';
import { formatPortConnection, formatPortSummary, formatPortTable, formatRelativeTime } from '../utils/formatting.js';
import { readOnly, mutating, destructive } from './annotations.js';

const OS_FINGERPRINTS = ['windows:1', 'macosx:3', 'macosx:4', 'ios:2', 'ios:1', 'android:3', 'android:1'] as const;
const PORT_STATUS_FILTERS = ['active', 'suspended', 'expired'] as const;
const PROXY_LOGIN = /^[A-Za-z0-9_-]{3,32}$/;

/** A malformed id makes the API answer 500, so it is refused here with the way to get a real one. */
export const portIdSchema = z.string().regex(/^[a-f0-9]{24}$/i, 'portId must be the 24-character port ID from list_ports, not the port name');

/**
 * Tool definitions for port management
 */
export const portToolDefinitions = [
  {
    name: 'list_ports',
    annotations: readOnly('List Ports'),
    description: 'List your dedicated ports with status, country, carrier, expiry and port ids. Scope ports:read.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: PORT_STATUS_FILTERS,
          description: 'Only show ports in this state',
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          description: 'Maximum number of ports to show (default: 50)',
        },
      },
      required: [] as string[],
    },
  },
  {
    name: 'get_port',
    annotations: readOnly('Get Port'),
    description: 'Get one dedicated port with its location and ready-to-use HTTP and SOCKS5 connection strings (contains the port password). Scope ports:read.',
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
    annotations: mutating('Create Port'),
    description: 'Create a dedicated port on a carrier modem and return its connection strings. Uses one free port slot; traffic is metered from the account balance. Only countries from list_available_countries work (carrier modems in US, GB, FR, NL, PL, GE). Scope ports:write.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        countryId: {
          type: 'string',
          description: 'countryId from list_available_countries (an id, not a country code)',
        },
        carrierId: {
          type: 'string',
          description: 'Optional carrierId from list_available_countries(countryId)',
        },
        cityId: {
          type: 'string',
          description: 'Optional cityId from list_available_countries(countryId)',
        },
        expiresInDays: {
          type: 'number',
          minimum: 1,
          maximum: 365,
          description: 'Port lifetime in days (default: 30). Time is free.',
        },
        osFingerprint: {
          type: 'string',
          enum: OS_FINGERPRINTS,
          description: 'Optional OS fingerprint (see get_os_fingerprint_options)',
        },
      },
      required: ['countryId'],
    },
  },
  {
    name: 'delete_port',
    annotations: destructive('Delete Port'),
    description: 'Delete a dedicated port and free its slot. Its credentials stop working. Scope ports:write.',
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
    annotations: mutating('Update Port Credentials', true),
    description: 'Change the login and/or password of a dedicated port. Scope ports:write.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        portId: {
          type: 'string',
          description: 'The port ID to update',
        },
        proxyLogin: {
          type: 'string',
          minLength: 3,
          maxLength: 32,
          description: 'New login: 3-32 characters, letters, digits, _ and -',
        },
        proxyPassword: {
          type: 'string',
          minLength: 8,
          maxLength: 64,
          description: 'New password: 8-64 characters',
        },
      },
      required: ['portId'],
    },
  },
  {
    name: 'update_os_fingerprint',
    annotations: mutating('Update OS Fingerprint', true),
    description: 'Set the OS fingerprint (TCP/IP signature) a dedicated port presents. The API cannot clear a fingerprint once set. Scope ports:write.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        portId: {
          type: 'string',
          description: 'The port ID to update',
        },
        osFingerprint: {
          type: 'string',
          enum: OS_FINGERPRINTS,
          description: 'OS fingerprint value (see get_os_fingerprint_options)',
        },
      },
      required: ['portId', 'osFingerprint'],
    },
  },
  {
    name: 'reconfigure_port',
    annotations: destructive('Reconfigure Port'),
    description: 'Move a dedicated port to another country, carrier or city. This creates a NEW port (new id, login and port numbers) and removes the old one, so read the returned connection strings. Limited to 3 calls per 2 minutes and shares the 5-minute cooldown with rotate_port. Scope ports:write.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        portId: {
          type: 'string',
          description: 'The port ID to reconfigure',
        },
        countryId: {
          type: 'string',
          description: 'New countryId from list_available_countries',
        },
        carrierId: {
          type: 'string',
          description: 'Optional new carrierId',
        },
        cityId: {
          type: 'string',
          description: 'Optional new cityId',
        },
      },
      required: ['portId', 'countryId'],
    },
  },
  {
    name: 'extend_port',
    annotations: mutating('Extend Port'),
    description: 'Add hours to a dedicated port\'s expiry. Time is free; the answer includes how many hours the account still allows. Scope ports:write.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        portId: {
          type: 'string',
          description: 'The port ID to extend',
        },
        hours: {
          type: 'number',
          minimum: 1,
          description: 'Hours to add',
        },
      },
      required: ['portId', 'hours'],
    },
  },
] as const;

/**
 * Port tools handler
 */
export function createPortToolHandlers(api: ProxiesApi) {
  return {
    async list_ports(args: {
      status?: (typeof PORT_STATUS_FILTERS)[number];
      limit?: number;
    }): Promise<string> {
      try {
        const all = await api.ports.list();
        const matching = all.filter(port => {
          if (!args.status) return true;
          if (args.status === 'suspended') return port.suspended;
          return port.status === args.status;
        });

        if (matching.length === 0) {
          return 'No ports found matching the criteria.';
        }

        const shown = matching.slice(0, args.limit ?? 50);
        return `Found ${matching.length} ports (showing ${shown.length}):\n\n${formatPortTable(shown)}`;
      } catch (error) {
        throw new Error(`Failed to list ports: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async get_port(args: { portId: string }): Promise<string> {
      try {
        const port = await api.ports.get(args.portId);
        return `${formatPortSummary(port)}\n\n${formatPortConnection(port)}`;
      } catch (error) {
        throw new Error(`Failed to get port: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async create_port(args: {
      countryId: string;
      carrierId?: string;
      cityId?: string;
      expiresInDays?: number;
      osFingerprint?: string;
    }): Promise<string> {
      try {
        // Convert days to seconds (default 30 days)
        const days = args.expiresInDays ?? 30;

        const port = await api.ports.create({
          countryId: args.countryId,
          carrierId: args.carrierId,
          cityId: args.cityId,
          expiresAt: days * 24 * 60 * 60,
          osFingerprint: args.osFingerprint,
        });

        return `Port created successfully!\n\n${formatPortSummary(port)}\n\n${formatPortConnection(port)}`;
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
        return `OS fingerprint updated to: ${port.osFingerprint || args.osFingerprint}`;
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

        return [
          `Port reconfigured. It is now a NEW port: use ID ${port._id} from here on, the old ID ${args.portId} no longer exists.`,
          '',
          formatPortSummary(port),
          '',
          formatPortConnection(port),
        ].join('\n');
      } catch (error) {
        throw new Error(`Failed to reconfigure port: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async extend_port(args: { portId: string; hours: number }): Promise<string> {
      try {
        const result = await api.ports.extend(args.portId, args.hours);
        const remaining = await api.ports.getMaxExtendHours(args.portId);

        return [
          result.message || `Port extended by ${args.hours} hours.`,
          `New expiry: ${new Date(result.newExpiresAt).toISOString()} (${formatRelativeTime(new Date(result.newExpiresAt))})`,
          `Hours still available to add: ${remaining.maxHoursAllowed}`,
        ].join('\n');
      } catch (error) {
        throw new Error(`Failed to extend port: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  };
}

/**
 * Zod schemas for validation
 */
export const portSchemas = {
  list_ports: z.object({
    status: z.enum(PORT_STATUS_FILTERS).optional(),
    limit: z.number().min(1).max(100).optional(),
  }),
  get_port: z.object({
    portId: portIdSchema,
  }),
  create_port: z.object({
    countryId: z.string().min(1),
    carrierId: z.string().optional(),
    cityId: z.string().optional(),
    expiresInDays: z.number().min(1).max(365).optional(),
    osFingerprint: z.enum(OS_FINGERPRINTS).optional(),
  }),
  delete_port: z.object({
    portId: portIdSchema,
  }),
  update_port_credentials: z.object({
    portId: portIdSchema,
    proxyLogin: z.string().regex(PROXY_LOGIN).optional(),
    proxyPassword: z.string().min(8).max(64).optional(),
  }),
  update_os_fingerprint: z.object({
    portId: portIdSchema,
    osFingerprint: z.enum(OS_FINGERPRINTS),
  }),
  reconfigure_port: z.object({
    portId: portIdSchema,
    countryId: z.string().min(1),
    carrierId: z.string().optional(),
    cityId: z.string().optional(),
  }),
  extend_port: z.object({
    portId: portIdSchema,
    hours: z.number().min(1),
  }),
};
