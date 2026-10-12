/**
 * Account Tools
 * MCP tools for account information and usage
 */

import { z } from 'zod';
import type { ProxiesApi } from '../api/index.js';
import { formatAccountSummary, formatCurrency, formatGB } from '../utils/formatting.js';
import { readOnly } from './annotations.js';

/**
 * Tool definitions for account management
 */
export const accountToolDefinitions = [
  {
    name: 'get_account_summary',
    annotations: readOnly('Get Account Summary'),
    description: 'Get the account balance, free port slots, traffic bought and left, and any account alerts. Scope account:read.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: 'get_account_usage',
    annotations: readOnly('Get Account Usage'),
    description: 'Get traffic purchased, used and still available, split into Pool Gateway traffic and dedicated-port traffic. Use it to see whether the balance is empty (gateway error E_BALANCE_EXHAUSTED). Scope traffic:read.',
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
        const [breakdown, usage] = await Promise.all([
          api.account.getTrafficBreakdown(),
          api.account.getTrafficUsage(),
        ]);

        const usagePercent = breakdown.purchasedTrafficGB > 0
          ? (breakdown.trafficUsedGB / breakdown.purchasedTrafficGB * 100)
          : 0;
        const poolGB = usage.byPort.find(row => row.portId === 'gw_pool')?.totalGB ?? 0;

        const lines = [
          'Traffic Usage:',
          '',
          `  Purchased: ${formatGB(breakdown.purchasedTrafficGB)}`,
          `  Used: ${formatGB(breakdown.trafficUsedGB)}`,
          `  Available: ${formatGB(breakdown.availableTrafficGB)}`,
          `  Usage: ${usagePercent.toFixed(1)}%`,
          '',
          'Metered so far:',
          `  Pool Gateway: ${poolGB.toFixed(4)} GB`,
          `  Dedicated ports: ${Math.max(0, usage.total.totalGB - poolGB).toFixed(4)} GB`,
          '',
          `  Balance: ${formatCurrency(breakdown.balance, breakdown.currency)}`,
        ];

        if (breakdown.availableTrafficGB <= 0) {
          lines.push('', 'No traffic left: the gateway will refuse requests with E_BALANCE_EXHAUSTED. Add GB at https://client.proxies.sx/purchase.');
        }

        return lines.join('\n');
      } catch (error) {
        throw new Error(`Failed to get traffic usage: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
