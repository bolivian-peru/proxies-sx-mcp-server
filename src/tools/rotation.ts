/**
 * Rotation Tools
 * MCP tools for port rotation management
 */

import { z } from 'zod';
import { portIdSchema } from './ports.js';
import type { ProxiesApi } from '../api/index.js';
import { formatRotationEntry, formatPortSummary, formatPortConnection } from '../utils/formatting.js';
import type { CanRotateResponse } from '../api/index.js';
import { readOnly, mutating, destructive } from './annotations.js';

/**
 * Tool definitions for rotation management
 */
export const rotationToolDefinitions = [
  {
    name: 'rotate_port',
    annotations: destructive('Rotate Port'),
    description: 'Move a dedicated port to another modem in the same location. The login and password stay, but the HTTP and SOCKS5 port numbers change, so read the returned connection strings. One rotation per 5 minutes. Scope ports:rotate.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        portId: {
          type: 'string',
          description: 'The port ID to rotate',
        },
      },
      required: ['portId'],
    },
  },
  {
    name: 'check_rotation_availability',
    annotations: readOnly('Check Rotation Availability'),
    description: 'Check whether a dedicated port can be rotated now, how long the cooldown still runs and how many other modems are free. Scope ports:read.',
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
    name: 'configure_auto_rotation',
    annotations: mutating('Configure Auto Rotation', true),
    description: 'Turn automatic rotation of a dedicated port on or off and set its interval. Scope ports:write.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        portId: {
          type: 'string',
          description: 'The port ID to configure',
        },
        enabled: {
          type: 'boolean',
          description: 'Enable or disable auto-rotation',
        },
        intervalMinutes: {
          type: 'number',
          minimum: 5,
          maximum: 1440,
          description: 'Rotation interval in minutes (5-1440)',
        },
        matchCarrier: {
          type: 'boolean',
          description: 'Only rotate to devices with the same carrier',
        },
        matchCity: {
          type: 'boolean',
          description: 'Only rotate to devices in the same city',
        },
      },
      required: ['portId', 'enabled'],
    },
  },
  {
    name: 'get_rotation_history',
    annotations: readOnly('Get Rotation History'),
    description: 'Get the past rotations of a dedicated port: when, how triggered, the location it moved to and whether it worked. Scope ports:read.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        portId: {
          type: 'string',
          description: 'The port ID to get history for',
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          description: 'Maximum number of entries to return (default: 10)',
        },
      },
      required: ['portId'],
    },
  },
  {
    name: 'get_rotation_token_url',
    annotations: readOnly('Get Rotation Token URL'),
    description: 'Get the public rotation link of a dedicated port. Anyone holding the link can rotate the port with a plain GET, no API key. Scope ports:read.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        portId: {
          type: 'string',
          description: 'The port ID to get rotation URL for',
        },
      },
      required: ['portId'],
    },
  },
] as const;

function describeCooldown(result: CanRotateResponse): string[] {
  const lines = [`Cannot rotate: ${result.reason || 'not available right now'}`];
  if (result.cooldownRemaining) lines.push(`Cooldown remaining: ${result.cooldownRemaining} seconds`);
  if (result.nextRotationAt) lines.push(`Next rotation possible at: ${result.nextRotationAt}`);
  if (result.availableDevices != null) lines.push(`Other devices free: ${result.availableDevices}`);
  return lines;
}

/**
 * Rotation tools handler
 */
export function createRotationToolHandlers(api: ProxiesApi, baseUrl: string) {
  return {
    async rotate_port(args: { portId: string }): Promise<string> {
      try {
        // First check if rotation is available
        const canRotate = await api.rotation.canRotate(args.portId);
        if (!canRotate.canRotate) {
          return describeCooldown(canRotate).join('\n');
        }

        const result = await api.rotation.rotate(args.portId);
        const port = await api.ports.get(args.portId);

        return [
          result.message || 'Port rotated.',
          `Rotations so far: ${result.rotationCount ?? 'unknown'}${result.rotationDurationMs != null ? `, took ${result.rotationDurationMs} ms` : ''}`,
          'The port is on another device now and its HTTP and SOCKS5 port numbers have changed:',
          '',
          formatPortSummary(port),
          '',
          formatPortConnection(port),
        ].join('\n');
      } catch (error) {
        throw new Error(`Failed to rotate port: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async check_rotation_availability(args: { portId: string }): Promise<string> {
      try {
        const result = await api.rotation.canRotate(args.portId);

        if (!result.canRotate) {
          return describeCooldown(result).join('\n');
        }

        const free = result.availableDevices != null ? ` Other devices free: ${result.availableDevices}.` : '';
        return `Port can be rotated now.${free}`;
      } catch (error) {
        throw new Error(`Failed to check rotation availability: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async configure_auto_rotation(args: {
      portId: string;
      enabled: boolean;
      intervalMinutes?: number;
      matchCarrier?: boolean;
      matchCity?: boolean;
    }): Promise<string> {
      try {
        // Convert user-friendly minutes to seconds for the backend API
        const intervalSeconds = args.intervalMinutes ? args.intervalMinutes * 60 : undefined;

        const port = await api.rotation.updateSettings(args.portId, {
          enabled: args.enabled,
          intervalSeconds,
          matchCarrier: args.matchCarrier,
          matchCity: args.matchCity,
        });

        const settings = port.rotationSettings;
        const lines = ['Auto-rotation settings updated:'];
        lines.push(`  Enabled: ${settings?.enabled ?? false}`);

        if (settings?.enabled) {
          const intervalMinutes = Math.round((settings.intervalSeconds || 1200) / 60);
          lines.push(`  Interval: ${intervalMinutes} minutes`);
          lines.push(`  Match Carrier: ${settings.matchCarrier}`);
          lines.push(`  Match City: ${settings.matchCity}`);
          lines.push(`  Rotation Count: ${settings.rotationCount}`);
          if (settings.lastRotatedAt) {
            lines.push(`  Last Rotated: ${new Date(settings.lastRotatedAt).toISOString()}`);
          }
        }

        return lines.join('\n');
      } catch (error) {
        throw new Error(`Failed to configure auto-rotation: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async get_rotation_history(args: { portId: string; limit?: number }): Promise<string> {
      try {
        const { rotations: entries, total } = await api.rotation.getHistory(args.portId, args.limit ?? 10);

        if (entries.length === 0) {
          return 'No rotation history found for this port.';
        }

        const lines = [`Rotation History (${total} total, showing ${entries.length}):`];
        lines.push('');

        for (const entry of entries) {
          lines.push(formatRotationEntry(entry));
        }

        return lines.join('\n');
      } catch (error) {
        throw new Error(`Failed to get rotation history: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async get_rotation_token_url(args: { portId: string }): Promise<string> {
      try {
        const port = await api.ports.get(args.portId);

        if (!port.rotationToken) {
          return 'This port does not have a rotation token configured.';
        }

        const rotationUrl = api.rotation.getRotationTokenUrl(baseUrl, port.rotationToken);

        return [
          'Public Rotation URL:',
          rotationUrl,
          '',
          'A plain GET on this URL rotates the port, no API key needed. Treat it as a secret.',
          'Example: curl ' + rotationUrl,
        ].join('\n');
      } catch (error) {
        throw new Error(`Failed to get rotation token URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  };
}

/**
 * Zod schemas for validation
 */
export const rotationSchemas = {
  rotate_port: z.object({
    portId: portIdSchema,
  }),
  check_rotation_availability: z.object({
    portId: portIdSchema,
  }),
  configure_auto_rotation: z.object({
    portId: portIdSchema,
    enabled: z.boolean(),
    intervalMinutes: z.number().min(5).max(1440).optional(),
    matchCarrier: z.boolean().optional(),
    matchCity: z.boolean().optional(),
  }),
  get_rotation_history: z.object({
    portId: portIdSchema,
    limit: z.number().min(1).max(100).optional(),
  }),
  get_rotation_token_url: z.object({
    portId: portIdSchema,
  }),
};
