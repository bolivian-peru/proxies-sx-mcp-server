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
      'Cost: $4.00/GB. Duration is FREE. Min purchase: 0.1 GB ($0.40).',
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
            'Proxy tier. $4.00/GB. Duration is FREE. Default: shared',
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
      'Calculate pricing for x402 proxy purchase before buying. Duration is FREE - you only pay for traffic ($4/GB).',
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
      'Extend an active session by adding hours to its expiry. Duration extensions are FREE (duration-only top-up ' +
      'via /v1/x402/manage/session/topup) - no USDC is sent. All active ports in the session are extended. ' +
      'Accepts either a cached session ID or the x402s_ session token from the purchase response as session_id. ' +
      'To add more traffic (paid), use topup_x402_session instead.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID or x402s_ session token to extend (optional, uses most recent if not provided)',
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
  // ============ x402 Pool Gateway Access (single credential, every country in your tier) ============
  {
    name: 'x402_get_pool_access',
    description:
      'Buy Pool Gateway access with USDC on Base or Solana - no API key, payment is authentication. ' +
      'Unlike x402_get_proxy (one dedicated modem), this returns ONE credential that reaches EVERY country in your tier ' +
      'via the username DSL (e.g. psx_xxx-mbl-us, -mbl-pl, ...). v1 tier is "mbl" ($4/GB, metered, production ProxySmart modems). ' +
      'HTTP proxy on port 7000 only. Pays on-chain then caches the returned session token. ' +
      'Note: sticky pins the MODEM, not the IP - carrier NAT may still re-issue the egress IP.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        country: {
          type: 'string',
          description: 'Default country for the credential (ISO 3166-1 alpha-2, e.g. US, DE). One credential still reaches every country in your tier via the username DSL. Default: us',
        },
        traffic_gb: {
          type: 'number',
          description: 'GB to purchase (min 0.1). The GB cap IS your USDC envelope. Default: 1 GB',
        },
        tier: {
          type: 'string',
          enum: ['mbl'],
          description: 'Pool tier. v1 = "mbl" only ($4/GB, metered, production modems). peer tiers are not yet enabled. Default: mbl',
        },
        sid: {
          type: 'string',
          description: 'Optional sticky session id (8-64 chars). Required for stickiness to persist across connections.',
        },
        rot: {
          type: 'string',
          description: 'Optional rotation mode (auto5/auto10/auto20/auto60/ondemand/sticky/hard). Default: sticky',
        },
      },
      required: [],
    },
  },
  {
    name: 'x402_pool_credit',
    description:
      'Check remaining pool-access credit (GB) for a pool session. Reads the real pak-backed balance. ' +
      'Uses the cached session token if session_token is omitted.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_token: {
          type: 'string',
          description: 'Pool session token (x402s_...). Optional - uses the cached pool session if omitted.',
        },
      },
      required: [],
    },
  },
  {
    name: 'x402_pool_topup',
    description:
      'Top up a pool session with more GB (and/or duration) by paying USDC on-chain. ' +
      'Traffic costs $4/GB (metered); duration-only top-ups are FREE. Pays automatically from your wallet. ' +
      'Uses the cached session token if session_token is omitted.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_token: {
          type: 'string',
          description: 'Pool session token (x402s_...). Optional - uses the cached pool session if omitted.',
        },
        add_traffic_gb: {
          type: 'number',
          description: 'Additional GB to buy (min 0.1). Costs $4/GB. Omit for a free duration-only extension.',
        },
        add_duration_seconds: {
          type: 'number',
          description: 'Additional duration in seconds (min 3600). Duration is FREE.',
        },
      },
      required: [],
    },
  },
  {
    name: 'x402_pool_regenerate',
    description:
      'Rotate the pool credential secret (new pak password, SAME username). Use if the credential leaked. ' +
      'Uses the cached session token if session_token is omitted.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_token: {
          type: 'string',
          description: 'Pool session token (x402s_...). Optional - uses the cached pool session if omitted.',
        },
      },
      required: [],
    },
  },
  {
    name: 'x402_pool_connection',
    description:
      'Re-emit the full pool proxy credentials (host, port 7000, username, password, username template) for recovery. ' +
      'Uses the cached session token if session_token is omitted.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_token: {
          type: 'string',
          description: 'Pool session token (x402s_...). Optional - uses the cached pool session if omitted.',
        },
      },
      required: [],
    },
  },
  {
    name: 'x402_pool_usage',
    description:
      'Get per-day bandwidth usage (MB) for a pool session over the last N days (default 30, max 365), gap-filled with zeroes. ' +
      'Uses the cached session token if session_token is omitted.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_token: {
          type: 'string',
          description: 'Pool session token (x402s_...). Optional - uses the cached pool session if omitted.',
        },
        days: {
          type: 'number',
          description: 'Number of days of history to return (default 30, max 365).',
        },
      },
      required: [],
    },
  },
  {
    name: 'x402_pool_pricing',
    description:
      'Get the Pool Gateway tier catalog (no auth, no wallet needed): tiers, $/GB, min purchase, supported networks, and the username DSL. ' +
      'v1 tier = "mbl" ($4/GB, metered, production modems).',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_pool_stock',
    description:
      'Get public Pool Gateway stock - online endpoint COUNTS per country (no IPs are ever returned). ' +
      'No auth needed. Use this to see which countries currently have capacity before buying pool access.',
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
  // Pool Gateway Access
  x402_get_pool_access: z.object({
    country: z.string().min(2).max(3).optional(),
    traffic_gb: z.number().min(0.1).max(100).optional(),
    tier: z.enum(['mbl']).optional(),
    sid: z.string().optional(),
    rot: z.string().optional(),
  }),
  x402_pool_credit: z.object({
    session_token: z.string().optional(),
  }),
  x402_pool_topup: z.object({
    session_token: z.string().optional(),
    add_traffic_gb: z.number().min(0.1).max(100).optional(),
    add_duration_seconds: z.number().min(3600).optional(),
  }),
  x402_pool_regenerate: z.object({
    session_token: z.string().optional(),
  }),
  x402_pool_connection: z.object({
    session_token: z.string().optional(),
  }),
  x402_pool_usage: z.object({
    session_token: z.string().optional(),
    days: z.number().min(1).max(365).optional(),
  }),
  x402_pool_pricing: z.object({}),
  get_pool_stock: z.object({}),
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
  return toolName.startsWith('x402_') || toolName === 'get_pool_stock';
}
