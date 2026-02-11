/**
 * X402 Session Management Tools
 * Tools for agents to manage their x402 sessions and ports
 */

import { z } from 'zod';
import type { ProxiesApi } from '../api/index.js';

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
    description: 'Replace an offline/broken proxy port with a new one on a different device. Free, max 3 replacements per session. The broken port is deleted and a new port is created on a different device.',
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
    description: 'Calculate the cost to top up a session with additional traffic and/or duration. Duration extensions are free, traffic costs $4/GB (shared) or $8/GB (private).',
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
    description: 'Top up a session with additional traffic and/or duration. Requires a Payment-Signature (tx hash) for traffic top-ups. Duration-only extensions are free.',
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

// ==================== HANDLERS ====================

export function createX402SessionToolHandlers(api: ProxiesApi, _baseUrl: string) {
  return {
    /**
     * Get session details via session token
     */
    async get_x402_session(args: z.infer<typeof getSessionSchema>): Promise<string> {
      try {
        const session = await api.client.get<X402SessionDetails & { ports: X402PortInfo[] }>(
          '/x402/manage/session',
          undefined, // no query params
          { 'X-Session-Token': args.sessionToken },
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

        if (session.ports && session.ports.length > 0) {
          lines.push('## Ports');
          lines.push('');
          for (const port of session.ports) {
            lines.push(`### ${port.displayName || port.id}`);
            lines.push(`- **HTTP:** \`${port.http}\``);
            lines.push(`- **SOCKS5:** \`${port.socks5}\``);
            lines.push(`- **Rotation URL:** ${port.rotationUrl}`);
            lines.push(`- **Expires:** ${port.expiresAt}`);
            lines.push('');
          }
        }

        return lines.join('\n');
      } catch (error: any) {
        if (error.statusCode === 404) {
          return 'Session not found or expired. The session token may be invalid.';
        }
        return `Error fetching session: ${error.message}`;
      }
    },

    /**
     * List all ports in session
     */
    async list_x402_ports(args: z.infer<typeof getSessionSchema>): Promise<string> {
      try {
        const result = await api.client.get<{ ports: X402PortInfo[] }>(
          '/x402/manage/ports',
          undefined,
          { 'X-Session-Token': args.sessionToken },
        );

        if (!result.ports || result.ports.length === 0) {
          return 'No ports found in this session.';
        }

        const lines = [
          '# Session Ports',
          '',
          `Total: ${result.ports.length} port(s)`,
          '',
        ];

        for (const port of result.ports) {
          const expiresIn = port.expiresInSeconds
            ? port.expiresInSeconds > 3600
              ? `${(port.expiresInSeconds / 3600).toFixed(1)} hours`
              : `${Math.round(port.expiresInSeconds / 60)} minutes`
            : 'unknown';

          lines.push(`## ${port.displayName || port.id}`);
          lines.push('');
          lines.push('**Connection Strings:**');
          lines.push('```');
          lines.push(`HTTP:   ${port.http}`);
          lines.push(`SOCKS5: ${port.socks5}`);
          lines.push('```');
          lines.push('');
          lines.push(`- **Expires in:** ${expiresIn}`);
          lines.push(`- **Rotation URL:** ${port.rotationUrl}`);
          lines.push('');
        }

        return lines.join('\n');
      } catch (error: any) {
        return `Error listing ports: ${error.message}`;
      }
    },

    /**
     * Get port status
     */
    async get_x402_port_status(args: z.infer<typeof getPortStatusSchema>): Promise<string> {
      try {
        const port = await api.client.get<X402PortInfo>(
          `/x402/manage/ports/${args.portId}/status`,
          undefined,
          { 'X-Session-Token': args.sessionToken },
        );

        const expiresIn = port.expiresInSeconds
          ? port.expiresInSeconds > 3600
            ? `${(port.expiresInSeconds / 3600).toFixed(1)} hours`
            : `${Math.round(port.expiresInSeconds / 60)} minutes`
          : 'unknown';

        const lines = [
          `# Port Status: ${port.displayName || port.id}`,
          '',
          `**Status:** ${port.status || 'active'}`,
          `**Expires in:** ${expiresIn}`,
          `**Expires at:** ${port.expiresAt}`,
          '',
          '## Connection',
          '```',
          `HTTP:   ${port.http}`,
          `SOCKS5: ${port.socks5}`,
          '```',
          '',
          '## IP Rotation',
          `**Rotation URL:** ${port.rotationUrl}`,
          '',
        ];

        if (port.traffic) {
          lines.push('## Traffic Usage');
          lines.push(`- **Used:** ${port.traffic.usedGB} GB (${port.traffic.usedBytes.toLocaleString()} bytes)`);
        }

        return lines.join('\n');
      } catch (error: any) {
        if (error.statusCode === 404) {
          return 'Port not found or not owned by this session.';
        }
        return `Error fetching port status: ${error.message}`;
      }
    },

    /**
     * Get sessions by wallet address
     */
    async get_sessions_by_wallet(args: z.infer<typeof getSessionByWalletSchema>): Promise<string> {
      try {
        const status = args.status || 'active';
        const result = await api.client.get<{ sessions: X402SessionDetails[]; total: number }>(
          `/x402/sessions/wallet/${args.walletAddress}?status=${status}`
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
          const statusIcon = session.isActive ? '🟢' : '🔴';
          lines.push(`## ${statusIcon} Session ${session.sessionId.slice(-8)}`);
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
      } catch (error: any) {
        return `Error fetching sessions: ${error.message}`;
      }
    },

    /**
     * Get session status
     */
    async get_session_status(args: z.infer<typeof getSessionStatusSchema>): Promise<string> {
      try {
        const status = await api.client.get<X402SessionStatus>(
          `/x402/sessions/${args.sessionId}/status`
        );

        const statusIcon = status.status === 'active' ? '🟢 Active' : '🔴 Expired';
        const trafficPercent = status.traffic.percentUsed;
        const trafficBar = '█'.repeat(Math.floor(trafficPercent / 10)) + '░'.repeat(10 - Math.floor(trafficPercent / 10));

        return [
          `# Session Status: ${statusIcon}`,
          '',
          `**ID:** ${status.id}`,
          `**Wallet:** ${status.walletAddress}`,
          `**Expires:** ${status.expiresAt}`,
          '',
          '## Traffic Usage',
          `[${trafficBar}] ${trafficPercent.toFixed(1)}%`,
          '',
          `- **Allowed:** ${status.traffic.allowedGB} GB`,
          `- **Used:** ${status.traffic.usedGB} GB`,
          `- **Remaining:** ${status.traffic.remainingGB} GB`,
        ].join('\n');
      } catch (error: any) {
        if (error.statusCode === 404) {
          return 'Session not found. Check the session ID.';
        }
        return `Error fetching session status: ${error.message}`;
      }
    },

    /**
     * Replace an offline/broken port with a new one
     */
    async replace_x402_port(args: z.infer<typeof replacePortSchema>): Promise<string> {
      try {
        const body: any = {};
        if (args.portId) body.portId = args.portId;
        if (args.country) body.country = args.country;
        if (args.city) body.city = args.city;
        if (args.carrier) body.carrier = args.carrier;

        const result = await api.client.post<any>(
          '/x402/manage/ports/replace',
          body,
          { 'X-Session-Token': args.sessionToken },
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
      } catch (error: any) {
        return `Error replacing port: ${error.message}`;
      }
    },

    /**
     * Calculate top-up cost
     */
    async calculate_x402_topup(args: z.infer<typeof topupCalculateSchema>): Promise<string> {
      try {
        const params: Record<string, string> = {};
        if (args.addTrafficGB) params.addTrafficGB = String(args.addTrafficGB);
        if (args.addDurationSeconds) params.addDurationSeconds = String(args.addDurationSeconds);

        const queryString = new URLSearchParams(params).toString();
        const result = await api.client.get<any>(
          `/x402/manage/session/topup/calculate?${queryString}`,
          undefined,
          { 'X-Session-Token': args.sessionToken },
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
      } catch (error: any) {
        return `Error calculating top-up cost: ${error.message}`;
      }
    },

    /**
     * Top up a session with additional traffic/duration
     */
    async topup_x402_session(args: z.infer<typeof topupSessionSchema>): Promise<string> {
      try {
        const body: any = {};
        if (args.addTrafficGB) body.addTrafficGB = args.addTrafficGB;
        if (args.addDurationSeconds) body.addDurationSeconds = args.addDurationSeconds;

        const result = await api.client.post<any>(
          '/x402/manage/session/topup',
          body,
          {
            'X-Session-Token': args.sessionToken,
            'Payment-Signature': args.paymentSignature,
          },
        );

        const lines = [
          '# Session Topped Up Successfully',
          '',
          `**Session ID:** ${result.sessionId}`,
          `**Traffic Allocated:** ${result.trafficAllocatedGB} GB`,
          `**New Expiration:** ${result.expiresAt}`,
          '',
          '## Payment',
          `- **TX Hash:** ${result.payment.txHash}`,
          `- **Network:** ${result.payment.network}`,
          `- **Amount:** $${result.payment.amountUSDC} USDC`,
          '',
        ];

        if (result.ports && result.ports.length > 0) {
          lines.push('## Updated Ports');
          for (const port of result.ports) {
            lines.push(`- **${port.id}** - New expiration: ${port.expiresAt}`);
          }
        }

        return lines.join('\n');
      } catch (error: any) {
        return `Error topping up session: ${error.message}`;
      }
    },
  };
}
