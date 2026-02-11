/**
 * x402 MCP Tool Definitions
 * Tool schemas for x402 protocol integration
 */

import { z } from 'zod';

/**
 * x402 tool definitions for MCP
 */
export const x402ToolDefinitions = [
  {
    name: 'x402_get_proxy',
    description:
      'Purchase a mobile proxy instantly using USDC on Base or Solana. No API key needed - payment is authentication. ' +
      'Returns proxy credentials (HTTP/SOCKS5) immediately after on-chain payment confirmation. ' +
      'Cost: $4.00/GB shared, $8.00/GB private. Duration is FREE. Min purchase: 0.1 GB ($0.40).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        country: {
          type: 'string',
          description:
            'Country code (ISO 3166-1 alpha-2). Examples: US, DE, UK, FR, NL, PL, IT, ES, RU, UA, TR, IN, BR, MX, CA',
        },
        duration_hours: {
          type: 'number',
          description: 'Duration in hours (1-720). Default: 1 hour',
        },
        traffic_gb: {
          type: 'number',
          description: 'Traffic allowance in GB (1-100). Default: 1 GB',
        },
        tier: {
          type: 'string',
          enum: ['shared', 'private'],
          description:
            'Proxy tier. shared=$4.00/GB, private=$8.00/GB (exclusive device). Duration is FREE. Default: shared',
        },
        city: {
          type: 'string',
          description: 'City code for specific location (optional)',
        },
        carrier: {
          type: 'string',
          description: 'Mobile carrier code (optional)',
        },
      },
      required: ['country'],
    },
  },
  {
    name: 'x402_get_pricing',
    description:
      'Calculate pricing for x402 proxy purchase before buying. Duration is FREE - you only pay for traffic (shared=$4/GB, private=$8/GB).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        traffic_gb: {
          type: 'number',
          description: 'Traffic in GB. Default: 1',
        },
        tier: {
          type: 'string',
          enum: ['shared', 'private'],
          description: 'Proxy tier. Default: shared',
        },
      },
      required: [],
    },
  },
  {
    name: 'x402_list_sessions',
    description:
      'List all active x402 proxy sessions for this wallet. Shows session IDs, locations, expiry times, and connection details.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'x402_check_session',
    description:
      'Check status and traffic usage of an x402 session. Shows remaining time, traffic used/remaining, and connection details. ' +
      'If no session_id provided, shows the most recent active session.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID to check (optional, uses most recent if not provided)',
        },
      },
      required: [],
    },
  },
  {
    name: 'x402_wallet_balance',
    description:
      'Check USDC balance on Base network. Shows wallet address for topping up and current balance.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'x402_rotate_ip',
    description:
      'Rotate the proxy to get a new IP address. Uses the rotation URL for the specified or most recent session.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID to rotate (optional, uses most recent if not provided)',
        },
      },
      required: [],
    },
  },
  {
    name: 'x402_list_countries',
    description:
      'List all available countries for proxy purchase. Shows country codes, names, and availability status. ' +
      'Use this to discover which locations are available before purchasing.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'x402_list_cities',
    description:
      'List available cities in a specific country. Useful for targeting specific metropolitan areas.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        country: {
          type: 'string',
          description: 'Country code (ISO 3166-1 alpha-2). Example: US, DE, UK',
        },
      },
      required: ['country'],
    },
  },
  {
    name: 'x402_list_carriers',
    description:
      'List available mobile carriers in a specific country. Useful for targeting specific networks.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        country: {
          type: 'string',
          description: 'Country code (ISO 3166-1 alpha-2). Example: US, DE, UK',
        },
      },
      required: ['country'],
    },
  },
  {
    name: 'x402_extend_session',
    description:
      'Extend an active session by paying more USDC. Adds additional hours to the session expiry time. ' +
      'Requires payment - will send USDC automatically from your wallet.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID to extend (optional, uses most recent if not provided)',
        },
        additional_hours: {
          type: 'number',
          description: 'Number of hours to add (1-168). Default: 1',
        },
      },
      required: [],
    },
  },
  {
    name: 'x402_service_status',
    description:
      'Check x402 service health and availability. Returns service status and any maintenance notices.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
] as const;

/**
 * Zod validation schemas for x402 tools
 */
export const x402Schemas = {
  x402_get_proxy: z.object({
    country: z.string().min(2).max(3),
    duration_hours: z.number().min(1).max(720).optional(),
    traffic_gb: z.number().min(0.1).max(100).optional(),
    tier: z.enum(['shared', 'private']).optional(),
    city: z.string().optional(),
    carrier: z.string().optional(),
  }),
  x402_get_pricing: z.object({
    traffic_gb: z.number().min(0.1).max(100).optional(),
    tier: z.enum(['shared', 'private']).optional(),
  }),
  x402_list_sessions: z.object({}),
  x402_check_session: z.object({
    session_id: z.string().optional(),
  }),
  x402_wallet_balance: z.object({}),
  x402_rotate_ip: z.object({
    session_id: z.string().optional(),
  }),
  x402_list_countries: z.object({}),
  x402_list_cities: z.object({
    country: z.string().min(2).max(3),
  }),
  x402_list_carriers: z.object({
    country: z.string().min(2).max(3),
  }),
  x402_extend_session: z.object({
    session_id: z.string().optional(),
    additional_hours: z.number().min(1).max(168).optional(),
  }),
  x402_service_status: z.object({}),
};

/**
 * Get all x402 tool names
 */
export function getX402ToolNames(): string[] {
  return x402ToolDefinitions.map((t) => t.name);
}

/**
 * Check if a tool name is an x402 tool
 */
export function isX402Tool(toolName: string): boolean {
  return toolName.startsWith('x402_');
}
