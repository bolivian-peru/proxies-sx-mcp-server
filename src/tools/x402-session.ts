/**
 * X402 Session Management Tools
 * Tools for agents to manage their x402 sessions and ports
 */

import { z } from 'zod';
import type { ProxiesApi } from '../api/index.js';
import type { X402TopupResult } from '../x402/types.js';
import { readOnly, mutating, destructive } from './annotations.js';

// ==================== SCHEMAS ====================

const getSessionSchema = z.object({
  sessionToken: z.string().describe('Session token from purchase response (x402s_...)'),
});

const getPortStatusSchema = z.object({
  sessionToken: z.string().describe('Session token from purchase response'),
  portId: z.string().describe('The port ID to check'),
});

const getSessionByWalletSchema = z.object({
  walletAddress: z.string().describe('Your wallet address (EVM 0x... or Solana base58)'),
  status: z.enum(['active', 'expired', 'all']).optional().describe('Filter by status'),
});

const getSessionStatusSchema = z.object({
  sessionId: z.string().describe('The session ID'),
});

const replacePortSchema = z.object({
  sessionToken: z.string().describe('Session token from purchase response'),
  portId: z.string().optional().describe('Specific port ID to replace (defaults to first offline port)'),
  country: z.string().optional().describe('Country code for new port (e.g., US)'),
  city: z.string().optional().describe('City code for new port'),
  carrier: z.string().optional().describe('Carrier code for new port'),
});

const topupCalculateSchema = z.object({
  sessionToken: z.string().describe('Session token from purchase response'),
  addTrafficGB: z.number().optional().describe('Additional traffic in GB (min 0.1)'),
  addDurationSeconds: z.number().optional().describe('Additional duration in seconds (min 3600)'),
});

const topupSessionSchema = z.object({
  sessionToken: z.string().describe('Session token from purchase response'),
  paymentSignature: z.string().describe('Blockchain tx hash (Solana signature or Base tx hash)'),
  addTrafficGB: z.number().optional().describe('Additional traffic in GB'),
  addDurationSeconds: z.number().optional().describe('Additional duration in seconds'),
});

export const x402SessionSchemas = {
  get_x402_session: getSessionSchema,
  list_x402_ports: getSessionSchema,
  get_x402_port_status: getPortStatusSchema,
  get_sessions_by_wallet: getSessionByWalletSchema,
  get_session_status: getSessionStatusSchema,
  replace_x402_port: replacePortSchema,
  calculate_x402_topup: topupCalculateSchema,
  topup_x402_session: topupSessionSchema,
};

// ==================== TOOL DEFINITIONS ====================

export const x402SessionToolDefinitions = [
  {
    name: 'get_x402_session',
    annotations: readOnly('Get x402 Session'),
    description: 'Get details of your x402 session including all ports. Use this after purchase to retrieve your proxy credentials and session info. Requires the session token from the purchase response.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionToken: {
          type: 'string',
          description: 'Session token from purchase response (starts with x402s_)',
        },
      },
      required: ['sessionToken'],
    },
  },
  {
    name: 'list_x402_ports',
    annotations: readOnly('List x402 Ports'),
    description: 'List all ports in your x402 session with connection strings and expiration times',
    inputSchema: {
      type: 'object',
      properties: {
        sessionToken: {
          type: 'string',
          description: 'Session token from purchase response',
        },
      },
      required: ['sessionToken'],
    },
  },
  {
    name: 'get_x402_port_status',
    annotations: readOnly('Get x402 Port Status'),
    description: 'Get detailed status of a specific port including traffic usage and connection info',
    inputSchema: {
      type: 'object',
      properties: {
        sessionToken: {
          type: 'string',
          description: 'Session token from purchase response',
        },
        portId: {
          type: 'string',
          description: 'The port ID to check',
        },
      },
      required: ['sessionToken', 'portId'],
    },
  },
  {
    name: 'get_sessions_by_wallet',
    annotations: readOnly('Get Sessions by Wallet'),
    description: 'List all x402 sessions associated with your wallet address. Useful for recovering session info.',
    inputSchema: {
      type: 'object',
      properties: {
        walletAddress: {
          type: 'string',
          description: 'Your wallet address (EVM 0x... or Solana base58)',
        },
        status: {
          type: 'string',
          enum: ['active', 'expired', 'all'],
          description: 'Filter by status (default: active)',
        },
      },
      required: ['walletAddress'],
    },
  },
  {
    name: 'get_session_status',
    annotations: readOnly('Get Session Status'),
    description: 'Get quick status check for a session including traffic usage and expiration',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'The session ID',
        },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'replace_x402_port',
    annotations: destructive('Replace x402 Port'),
    description: 'Replace an offline port of an x402 session with a new port on another device, at no charge. The old port is deleted and the number of replacements per session is limited.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionToken: {
          type: 'string',
          description: 'Session token from purchase response (starts with x402s_)',
        },
        portId: {
          type: 'string',
          description: 'Specific port ID to replace (optional - defaults to first offline port)',
        },
        country: {
          type: 'string',
          description: 'Country code for new port (e.g., US)',
        },
        city: {
          type: 'string',
          description: 'City code for new port',
        },
        carrier: {
          type: 'string',
          description: 'Carrier code for new port',
        },
      },
      required: ['sessionToken'],
    },
  },
  {
    name: 'calculate_x402_topup',
    annotations: readOnly('Calculate x402 Top-up'),
    description: 'Calculate what it costs to add traffic and/or time to an x402 session. Time is free; traffic is charged at the session\'s per-GB rate.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionToken: {
          type: 'string',
          description: 'Session token from purchase response',
        },
        addTrafficGB: {
          type: 'number',
          description: 'Additional traffic in GB (min 0.1)',
        },
        addDurationSeconds: {
          type: 'number',
          description: 'Additional duration in seconds (min 3600 = 1 hour)',
        },
      },
      required: ['sessionToken'],
    },
  },
  {
    name: 'topup_x402_session',
    annotations: mutating('Top Up x402 Session'),
    description: 'Add traffic and/or time to an x402 session. Adding traffic needs the transaction hash of a USDC payment for the amount calculate_x402_topup returned; adding time only is free.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionToken: {
          type: 'string',
          description: 'Session token from purchase response',
        },
        paymentSignature: {
          type: 'string',
          description: 'Blockchain tx hash (Solana signature or Base tx hash)',
        },
        addTrafficGB: {
          type: 'number',
          description: 'Additional traffic in GB',
        },
        addDurationSeconds: {
          type: 'number',
          description: 'Additional duration in seconds',
        },
      },
      required: ['sessionToken', 'paymentSignature'],
    },
  },
] as const;

// ==================== TYPES ====================

interface X402SessionDetails {
  sessionId: string;
  walletAddress: string;
  network: string;
  txHash: string;
  amountUSDC: number;
  tier: string;
  trafficAllocatedGB: number;
  trafficUsedGB: number;
  portCount: number;
  expiresAt: string;
  isActive: boolean;
  createdAt: string;
  ports?: X402PortInfo[];
}

interface X402PortInfo {
  id: string;
  displayName: string;
  http: string;
  socks5: string;
  expiresAt: string;
  expiresInSeconds?: number;
  rotationUrl: string;
  status?: string;
  traffic?: {
    usedBytes: number;
    usedGB: number;
  };
}

interface X402SessionStatus {
  id: string;
  status: 'active' | 'expired';
  walletAddress: string;
  expiresAt: string;
  traffic: {
    allowedGB: number;
    usedGB: number;
    remainingGB: number;
    percentUsed: number;
  };
}

interface X402ReplaceResult {
  portId: string;
  rotationUrl: string;
  proxy: { http: string; socks5: string; expiresAt: string };
  traffic: { allocatedGB: number; usedGB: number; remainingGB: number };
  location: { country: string; countryCode: string };
}

interface X402TopupQuote {
  trafficCost: number;
  durationCost: number;
  totalCost: number;
  breakdown: { addTrafficGB: number; addDurationSeconds: number; trafficPricePerGB: number; tier: string };
}

// ==================== HANDLERS ====================

function expiresIn(seconds?: number): string {
  if (!seconds) return 'unknown';
  if (seconds > 3600) return `${(seconds / 3600).toFixed(1)} hours`;
  return `${Math.round(seconds / 60)} minutes`;
}

/**
 * These routes authenticate with the x402 session token, sent as the
 * X-Session-Token header. Errors propagate to the server's single tool-error path.
 */
export function createX402SessionToolHandlers(api: ProxiesApi) {
  const withToken = (sessionToken: string) => ({ 'X-Session-Token': sessionToken });

  return {
    /**
     * Get session details via session token
     */
    async get_x402_session(args: z.infer<typeof getSessionSchema>): Promise<string> {
      const session = await api.client.get<X402SessionDetails>(
        '/v1/x402/manage/session',
        undefined,
        withToken(args.sessionToken),
      );

      const lines = [
        '# X402 Session Details',
        '',
        `**Session ID:** ${session.sessionId}`,
        `**Wallet:** ${session.walletAddress}`,
        `**Network:** ${session.network}`,
        `**Tier:** ${session.tier}`,
        `**Status:** ${session.isActive ? 'Active' : 'Expired'}`,
        '',
        '## Payment',
        `- **Amount:** $${session.amountUSDC} USDC`,
        `- **TX Hash:** ${session.txHash}`,
        '',
        '## Traffic',
        `- **Allocated:** ${session.trafficAllocatedGB} GB`,
        `- **Used:** ${session.trafficUsedGB} GB`,
        `- **Remaining:** ${(session.trafficAllocatedGB - session.trafficUsedGB).toFixed(2)} GB`,
        '',
        '## Expiration',
        `- **Expires At:** ${session.expiresAt}`,
        '',
      ];

      for (const port of session.ports ?? []) {
        lines.push(`### ${port.displayName || port.id}`);
        lines.push(`- **HTTP:** \`${port.http}\``);
        lines.push(`- **SOCKS5:** \`${port.socks5}\``);
        lines.push(`- **Rotation URL:** ${port.rotationUrl}`);
        lines.push(`- **Expires:** ${port.expiresAt}`);
        lines.push('');
      }

      return lines.join('\n');
    },

    /**
     * List all ports in session
     */
    async list_x402_ports(args: z.infer<typeof getSessionSchema>): Promise<string> {
      const result = await api.client.get<{ ports: X402PortInfo[] }>(
        '/v1/x402/manage/ports',
        undefined,
        withToken(args.sessionToken),
      );

      if (!result.ports || result.ports.length === 0) {
        return 'No ports found in this session.';
      }

      const lines = ['# Session Ports', '', `Total: ${result.ports.length} port(s)`, ''];

      for (const port of result.ports) {
        lines.push(`## ${port.displayName || port.id}`);
        lines.push('');
        lines.push('**Connection Strings:**');
        lines.push('```');
        lines.push(`HTTP:   ${port.http}`);
        lines.push(`SOCKS5: ${port.socks5}`);
        lines.push('```');
        lines.push('');
        lines.push(`- **Expires in:** ${expiresIn(port.expiresInSeconds)}`);
        lines.push(`- **Rotation URL:** ${port.rotationUrl}`);
        lines.push('');
      }

      return lines.join('\n');
    },

    /**
     * Get port status
     */
    async get_x402_port_status(args: z.infer<typeof getPortStatusSchema>): Promise<string> {
      const port = await api.client.get<X402PortInfo>(
        `/v1/x402/manage/ports/${args.portId}/status`,
        undefined,
        withToken(args.sessionToken),
      );

      const lines = [
        `# Port Status: ${port.displayName || port.id}`,
        '',
        `**Status:** ${port.status || 'active'}`,
        `**Expires in:** ${expiresIn(port.expiresInSeconds)}`,
        `**Expires at:** ${port.expiresAt}`,
        '',
        '## Connection',
        '```',
        `HTTP:   ${port.http}`,
        `SOCKS5: ${port.socks5}`,
        '```',
        '',
        '## Rotation',
        `**Rotation URL:** ${port.rotationUrl}`,
        '',
      ];

      if (port.traffic) {
        lines.push('## Traffic Usage');
        lines.push(`- **Used:** ${port.traffic.usedGB} GB (${port.traffic.usedBytes.toLocaleString()} bytes)`);
      }

      return lines.join('\n');
    },

    /**
     * Get sessions by wallet address
     */
    async get_sessions_by_wallet(args: z.infer<typeof getSessionByWalletSchema>): Promise<string> {
      const status = args.status || 'active';
      const result = await api.client.get<{ sessions: X402SessionDetails[]; total: number }>(
        `/v1/x402/sessions/wallet/${args.walletAddress}`,
        { status },
      );

      if (!result.sessions || result.sessions.length === 0) {
        return `No ${status} sessions found for wallet ${args.walletAddress}`;
      }

      const lines = [
        '# Your X402 Sessions',
        '',
        `**Wallet:** ${args.walletAddress}`,
        `**Filter:** ${status}`,
        `**Total:** ${result.total} session(s)`,
        '',
      ];

      for (const session of result.sessions) {
        lines.push(`## Session ${session.sessionId.slice(-8)} (${session.isActive ? 'active' : 'expired'})`);
        lines.push(`- **ID:** ${session.sessionId}`);
        lines.push(`- **Tier:** ${session.tier}`);
        lines.push(`- **Ports:** ${session.portCount}`);
        lines.push(`- **Amount:** $${session.amountUSDC} USDC`);
        lines.push(`- **Traffic:** ${session.trafficUsedGB}/${session.trafficAllocatedGB} GB`);
        lines.push(`- **Expires:** ${session.expiresAt}`);
        lines.push(`- **TX:** ${session.txHash}`);
        lines.push('');
      }

      return lines.join('\n');
    },

    /**
     * Get session status
     */
    async get_session_status(args: z.infer<typeof getSessionStatusSchema>): Promise<string> {
      const status = await api.client.get<X402SessionStatus>(`/v1/x402/sessions/${args.sessionId}/status`);

      return [
        `# Session Status: ${status.status}`,
        '',
        `**ID:** ${status.id}`,
        `**Wallet:** ${status.walletAddress}`,
        `**Expires:** ${status.expiresAt}`,
        '',
        '## Traffic Usage',
        `- **Allowed:** ${status.traffic.allowedGB} GB`,
        `- **Used:** ${status.traffic.usedGB} GB (${status.traffic.percentUsed.toFixed(1)}%)`,
        `- **Remaining:** ${status.traffic.remainingGB} GB`,
      ].join('\n');
    },

    /**
     * Replace an offline/broken port with a new one
     */
    async replace_x402_port(args: z.infer<typeof replacePortSchema>): Promise<string> {
      const { sessionToken, ...body } = args;
      const result = await api.client.post<X402ReplaceResult>(
        '/v1/x402/manage/ports/replace',
        body,
        undefined,
        withToken(sessionToken),
      );

      return [
        '# Port Replaced Successfully',
        '',
        '## New Proxy Credentials',
        '```',
        `HTTP:   ${result.proxy.http}`,
        `SOCKS5: ${result.proxy.socks5}`,
        '```',
        '',
        `**Port ID:** ${result.portId}`,
        `**Expires:** ${result.proxy.expiresAt}`,
        `**Rotation URL:** ${result.rotationUrl}`,
        '',
        '## Traffic',
        `- **Allocated:** ${result.traffic.allocatedGB} GB`,
        `- **Used:** ${result.traffic.usedGB} GB`,
        `- **Remaining:** ${result.traffic.remainingGB} GB`,
        '',
        `**Location:** ${result.location.country} (${result.location.countryCode})`,
      ].join('\n');
    },

    /**
     * Calculate top-up cost
     */
    async calculate_x402_topup(args: z.infer<typeof topupCalculateSchema>): Promise<string> {
      const result = await api.client.get<X402TopupQuote>(
        '/v1/x402/manage/session/topup/calculate',
        { addTrafficGB: args.addTrafficGB, addDurationSeconds: args.addDurationSeconds },
        withToken(args.sessionToken),
      );

      return [
        '# Top-Up Cost Calculation',
        '',
        `**Traffic Cost:** $${result.trafficCost}`,
        `**Duration Cost:** $${result.durationCost} (duration is free)`,
        `**Total Cost:** $${result.totalCost} USDC`,
        '',
        '## Breakdown',
        `- **Add Traffic:** ${result.breakdown.addTrafficGB} GB`,
        `- **Add Duration:** ${result.breakdown.addDurationSeconds} seconds`,
        `- **Traffic Price:** $${result.breakdown.trafficPricePerGB}/GB`,
        `- **Tier:** ${result.breakdown.tier}`,
        '',
        result.totalCost > 0
          ? 'Send the total amount in USDC, then call topup_x402_session with the tx hash.'
          : 'This is a free duration-only extension. Call topup_x402_session with any string as payment signature.',
      ].join('\n');
    },

    /**
     * Top up a session with additional traffic/duration
     */
    async topup_x402_session(args: z.infer<typeof topupSessionSchema>): Promise<string> {
      const result = await api.client.post<X402TopupResult>(
        '/v1/x402/manage/session/topup',
        { addTrafficGB: args.addTrafficGB, addDurationSeconds: args.addDurationSeconds },
        undefined,
        { ...withToken(args.sessionToken), 'Payment-Signature': args.paymentSignature },
      );

      const lines = [
        '# Session Topped Up Successfully',
        '',
        `**Session ID:** ${result.sessionId}`,
        `**Traffic Allocated:** ${result.trafficAllocatedGB} GB`,
        `**New Expiration:** ${result.expiresAt}`,
        '',
      ];

      if (result.payment) {
        lines.push('## Payment');
        lines.push(`- **TX Hash:** ${result.payment.txHash}`);
        lines.push(`- **Network:** ${result.payment.network}`);
        lines.push(`- **Amount:** $${result.payment.amountUSDC} USDC`);
        lines.push('');
      }

      if (result.ports && result.ports.length > 0) {
        lines.push('## Updated Ports');
        for (const port of result.ports) {
          lines.push(`- **${port.id}** - New expiration: ${port.expiresAt}`);
        }
      }

      return lines.join('\n');
    },
  };
}
