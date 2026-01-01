/**
 * Account Tools
 * MCP tools for account information and usage
 */

import { z } from 'zod';
import type { ProxiesApi } from '../api/index.js';
import { formatAccountSummary, formatGB } from '../utils/formatting.js';

/**
 * Tool definitions for account management
 */
export const accountToolDefinitions = [
  {
    name: 'get_account_summary',
    description: 'Get account summary including balance, email, and resource usage (slots and traffic for shared/private categories)',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: 'get_account_usage',
    description: 'Get detailed traffic usage breakdown by category (shared vs private)',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  },
] as const;

/**
 * Account tools handler
 */
export function createAccountToolHandlers(api: ProxiesApi) {
  return {
    async get_account_summary(): Promise<string> {
      try {
        const account = await api.account.getSummary();
        return formatAccountSummary(account);
      } catch (error) {
        throw new Error(`Failed to get account summary: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async get_account_usage(): Promise<string> {
      try {
        const breakdown = await api.account.getTrafficBreakdown();

        const usagePercent = breakdown.purchasedTrafficGB > 0
          ? (breakdown.trafficUsedGB / breakdown.purchasedTrafficGB * 100)
          : 0;

        const lines = [
          'Traffic Usage:',
          '',
          `  Purchased: ${formatGB(breakdown.purchasedTrafficGB)}`,
          `  Used: ${formatGB(breakdown.trafficUsedGB)}`,
          `  Available: ${formatGB(breakdown.availableTrafficGB)}`,
          `  Usage: ${usagePercent.toFixed(1)}%`,
          '',
          `  Price: $${breakdown.pricePerGB}/GB`,
          `  Balance: $${breakdown.balance.toFixed(2)} ${breakdown.currency}`,
        ];

        return lines.join('\n');
      } catch (error) {
        throw new Error(`Failed to get traffic breakdown: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  };
}

/**
 * Zod schemas for validation
 */
export const accountSchemas = {
  get_account_summary: z.object({}),
  get_account_usage: z.object({}),
};
