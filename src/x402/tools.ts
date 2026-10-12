/**
 * x402 MCP Tool Definitions
 * Tools of the optional wallet mode (AGENT_WALLET_KEY): pay per GB in USDC,
 * no account. Prices are read from the API by the tools, not stated here.
 */

import { z } from 'zod';
import { readOnly, mutating, destructive, onChain } from '../tools/annotations.js';

const POOL_TIERS = ['mbl', 'peer'] as const;

const sessionId = {
  type: 'string',
  description: 'Session ID (optional: the most recent active session is used when omitted)',
};
const poolSessionToken = {
  type: 'string',
  description: 'Pool session token (x402s_...). Optional: the token cached by x402_get_pool_access is used when omitted.',
};
const noInput = { type: 'object' as const, properties: {}, required: [] as string[] };

/**
 * x402 tool definitions for MCP
 */
export const x402ToolDefinitions = [
  {
    name: 'x402_get_proxy',
    annotations: onChain(mutating('x402: Buy Proxy')),
    description:
      'Buy a dedicated mobile proxy on one carrier modem by paying USDC from the agent wallet; no account needed. ' +
      'Sends an on-chain payment, then returns HTTP and SOCKS5 credentials. You pay per GB (see x402_get_pricing); time is free. ' +
      'Only the countries from x402_list_countries work. Spends money.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        country: {
          type: 'string',
          description: '2-letter ISO country code from x402_list_countries',
        },
        duration_hours: {
          type: 'number',
          minimum: 1,
          maximum: 720,
          description: 'Duration in hours (1-720, default: 1). Time is free.',
        },
        traffic_gb: {
          type: 'number',
          minimum: 0.1,
          maximum: 100,
          description: 'Traffic in GB (0.1-100, default: 1)',
        },
        city: {
          type: 'string',
          description: 'Optional city name or code. There is no public list: leave it out unless you know the value.',
        },
        carrier: {
          type: 'string',
          description: 'Optional carrier name or code. There is no public list: leave it out unless you know the value.',
        },
      },
      required: ['country'],
    },
  },
  {
    name: 'x402_get_pricing',
    annotations: onChain(readOnly('x402: Get Pricing')),
    description:
      'Get the live x402 price per GB, the smallest purchase, the allowed duration and the payment networks, and compare the cost of a purchase with the wallet balance.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        traffic_gb: {
          type: 'number',
          minimum: 0.1,
          maximum: 100,
          description: 'Traffic in GB to price (default: 1)',
        },
      },
      required: [] as string[],
    },
  },
  {
    name: 'x402_list_sessions',
    annotations: readOnly('x402: List Sessions'),
    description:
      'List the active x402 proxy sessions this wallet bought from this machine, with location, expiry and proxy host.',
    inputSchema: noInput,
  },
  {
    name: 'x402_check_session',
    annotations: readOnly('x402: Check Session'),
    description:
      'Get status, time left, traffic used and the connection strings of an x402 proxy session. Returns the proxy password.',
    inputSchema: { type: 'object' as const, properties: { session_id: sessionId }, required: [] as string[] },
  },
  {
    name: 'x402_wallet_balance',
    annotations: onChain(readOnly('x402: Wallet Balance')),
    description:
      'Get the agent wallet address and its USDC and ETH (gas) balance on the Base network.',
    inputSchema: noInput,
  },
  {
    name: 'x402_rotate_ip',
    annotations: destructive('x402: Rotate Proxy'),
    description:
      'Move an x402 proxy to another modem so it gets a different exit IP. The connection details stay the same. One rotation per 5 minutes.',
    inputSchema: { type: 'object' as const, properties: { session_id: sessionId }, required: [] as string[] },
  },
  {
    name: 'x402_list_countries',
    annotations: readOnly('x402: List Countries'),
    description:
      'List the countries where x402_get_proxy can create a proxy right now, with the number of free modems.',
    inputSchema: noInput,
  },
  {
    name: 'x402_extend_session',
    annotations: mutating('x402: Extend Session'),
    description:
      'Add hours to an x402 proxy session. Time is free: no payment is sent. ' +
      'Takes a cached session ID or the x402s_ session token from the purchase response. To add traffic use topup_x402_session.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID or x402s_ session token (optional: the most recent active session is used when omitted)',
        },
        additional_hours: {
          type: 'number',
          minimum: 1,
          maximum: 168,
          description: 'Hours to add (1-168, default: 1)',
        },
      },
      required: [] as string[],
    },
  },
  {
    name: 'x402_service_status',
    annotations: onChain(readOnly('x402: Service Status')),
    description:
      'Check that the x402 payment service is up, and show the wallet balance and how many sessions are active or about to expire.',
    inputSchema: noInput,
  },
  // ============ x402 Pool Gateway access (one credential, every country of the tier) ============
  {
    name: 'x402_get_pool_access',
    annotations: onChain(mutating('x402: Buy Pool Access')),
    description:
      'Buy Pool Gateway traffic by paying USDC from the agent wallet; no account needed. ' +
      'Returns one credential for gw.proxies.sx that reaches every country of the tier: pool and country go in the username (pool_build_proxy_url builds it). ' +
      'Tier "peer" is the main network (residential and mobile, most countries); tier "mbl" is carrier modems in US, GB, FR, NL, PL and GE (Georgia). ' +
      'Prices per tier: x402_pool_pricing. Stock per country: pool_get_stock. Spends money.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tier: {
          type: 'string',
          enum: POOL_TIERS,
          description: 'Pool tier. When omitted the API uses its default tier (see x402_pool_pricing).',
        },
        country: {
          type: 'string',
          description: '2-letter ISO country code used in the ready-made connection string (default: us)',
        },
        traffic_gb: {
          type: 'number',
          minimum: 0.1,
          maximum: 100,
          description: 'GB to buy (0.1-100, default: 1)',
        },
        sid: {
          type: 'string',
          description: 'Optional session id for the ready-made connection string (8-64 characters, lowercase letters, digits and _)',
        },
        rot: {
          type: 'string',
          description: 'Optional rotation mode for the ready-made connection string: auto5, auto10, auto20, auto60, ondemand, sticky or hard',
        },
      },
      required: [] as string[],
    },
  },
  {
    name: 'x402_pool_credit',
    annotations: readOnly('x402: Pool Credit'),
    description: 'Get the GB bought, used and left on an x402 pool session.',
    inputSchema: { type: 'object' as const, properties: { session_token: poolSessionToken }, required: [] as string[] },
  },
  {
    name: 'x402_pool_topup',
    annotations: onChain(mutating('x402: Top Up Pool')),
    description:
      'Add GB and/or time to an x402 pool session. Adding GB sends a USDC payment from the agent wallet at the session\'s per-GB price; adding time only is free. Spends money when GB are added.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_token: poolSessionToken,
        add_traffic_gb: {
          type: 'number',
          minimum: 0.1,
          maximum: 100,
          description: 'GB to add (paid). Leave out to add time only.',
        },
        add_duration_seconds: {
          type: 'number',
          minimum: 3600,
          description: 'Seconds to add (at least 3600). Free.',
        },
      },
      required: [] as string[],
    },
  },
  {
    name: 'x402_pool_regenerate',
    annotations: destructive('x402: Regenerate Pool Password'),
    description:
      'Replace the password of an x402 pool credential, for example after a leak. The username stays; the old password stops working at once. Returns a secret.',
    inputSchema: { type: 'object' as const, properties: { session_token: poolSessionToken }, required: [] as string[] },
  },
  {
    name: 'x402_pool_connection',
    annotations: readOnly('x402: Pool Connection'),
    description:
      'Show the gateway host, port, username and password of an x402 pool session again. Returns a secret.',
    inputSchema: { type: 'object' as const, properties: { session_token: poolSessionToken }, required: [] as string[] },
  },
  {
    name: 'x402_pool_usage',
    annotations: readOnly('x402: Pool Usage'),
    description: 'Get the traffic of an x402 pool session per day, in MB.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_token: poolSessionToken,
        days: {
          type: 'number',
          minimum: 1,
          maximum: 365,
          description: 'Days of history (default: 30)',
        },
      },
      required: [] as string[],
    },
  },
  {
    name: 'x402_pool_pricing',
    annotations: readOnly('x402: Pool Pricing'),
    description:
      'Get the Pool Gateway tiers that can be bought with x402 and their live price per GB and smallest purchase. No wallet funds needed.',
    inputSchema: noInput,
  },
] as const;

const poolSession = z.object({ session_token: z.string().optional() });
const cachedSession = z.object({ session_id: z.string().optional() });

/**
 * Zod validation schemas for x402 tools
 */
export const x402Schemas = {
  x402_get_proxy: z.object({
    country: z.string().regex(/^[A-Za-z]{2}$/),
    duration_hours: z.number().min(1).max(720).optional(),
    traffic_gb: z.number().min(0.1).max(100).optional(),
    city: z.string().optional(),
    carrier: z.string().optional(),
  }),
  x402_get_pricing: z.object({
    traffic_gb: z.number().min(0.1).max(100).optional(),
  }),
  x402_list_sessions: z.object({}),
  x402_check_session: cachedSession,
  x402_wallet_balance: z.object({}),
  x402_rotate_ip: cachedSession,
  x402_list_countries: z.object({}),
  x402_extend_session: cachedSession.extend({
    additional_hours: z.number().min(1).max(168).optional(),
  }),
  x402_service_status: z.object({}),
  // Pool Gateway Access
  x402_get_pool_access: z.object({
    tier: z.enum(POOL_TIERS).optional(),
    country: z.string().regex(/^[A-Za-z]{2}$/).optional(),
    traffic_gb: z.number().min(0.1).max(100).optional(),
    sid: z.string().optional(),
    rot: z.string().optional(),
  }),
  x402_pool_credit: poolSession,
  x402_pool_topup: poolSession.extend({
    add_traffic_gb: z.number().min(0.1).max(100).optional(),
    add_duration_seconds: z.number().min(3600).optional(),
  }),
  x402_pool_regenerate: poolSession,
  x402_pool_connection: poolSession,
  x402_pool_usage: poolSession.extend({
    days: z.number().min(1).max(365).optional(),
  }),
  x402_pool_pricing: z.object({}),
};
