/**
 * Rotation Tools
 * MCP tools for port rotation management
 */

import { z } from 'zod';
import type { ProxiesApi } from '../api/index.js';
import { formatRotationEntry, formatPortSummary } from '../utils/formatting.js';

/**
 * Tool definitions for rotation management
 */
export const rotationToolDefinitions = [
  {
    name: 'rotate_port',
    description: 'Rotate a port to a new modem/device. This changes the IP address while keeping port credentials and settings.',
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
    description: 'Check if a port can be rotated right now (cooldown, circuit breaker status)',
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
    description: 'Configure automatic rotation settings for a port',
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
    description: 'Get the rotation history for a port',
    inputSchema: {
      type: 'object' as const,
      properties: {
        portId: {
          type: 'string',
          description: 'The port ID to get history for',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of entries to return (default: 10)',
        },
      },
      required: ['portId'],
    },
  },
  {
    name: 'get_rotation_token_url',
    description: 'Get the public rotation URL for a port (can be used without authentication)',
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
          return `Cannot rotate port: ${canRotate.reason}\n${canRotate.nextAvailableRotation ? `Next available rotation: ${canRotate.nextAvailableRotation}` : ''}`;
        }

        const port = await api.rotation.rotate(args.portId);
        return `Port rotated successfully!\n\nNew device info:\n${formatPortSummary(port)}`;
      } catch (error) {
        throw new Error(`Failed to rotate port: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async check_rotation_availability(args: { portId: string }): Promise<string> {
      try {
        const result = await api.rotation.canRotate(args.portId);

        if (result.canRotate) {
          return 'Port can be rotated now.';
        } else {
          const lines = [`Cannot rotate: ${result.reason}`];
          if (result.cooldownEndsAt) {
            lines.push(`Cooldown ends at: ${result.cooldownEndsAt}`);
          }
          if (result.nextAvailableRotation) {
            lines.push(`Next available rotation: ${result.nextAvailableRotation}`);
          }
          return lines.join('\n');
        }
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
        const result = await api.rotation.getHistory(args.portId, {
          limit: args.limit ?? 10,
        });

        // Handle both paginated response and direct array response
        const entries = Array.isArray(result) ? result : result.data || [];
        const total = Array.isArray(result) ? entries.length : result.total || entries.length;

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
          'This URL can be called without authentication to rotate the port.',
          'Example: curl -X GET ' + rotationUrl,
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
    portId: z.string().min(1),
  }),
  check_rotation_availability: z.object({
    portId: z.string().min(1),
  }),
  configure_auto_rotation: z.object({
    portId: z.string().min(1),
    enabled: z.boolean(),
    intervalMinutes: z.number().min(5).max(1440).optional(),
    matchCarrier: z.boolean().optional(),
    matchCity: z.boolean().optional(),
  }),
  get_rotation_history: z.object({
    portId: z.string().min(1),
    limit: z.number().min(1).max(100).optional(),
  }),
  get_rotation_token_url: z.object({
    portId: z.string().min(1),
  }),
};
