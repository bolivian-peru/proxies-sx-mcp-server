/**
 * Billing Tools
 * MCP tools for purchases and pricing
 */

import { z } from 'zod';
import type { ProxiesApi } from '../api/index.js';
import { formatTariff, formatCurrency, formatGB } from '../utils/formatting.js';

/**
 * Tool definitions for billing
 */
export const billingToolDefinitions = [
  {
    name: 'get_pricing',
    description: 'Get current pricing for slots and traffic (shared and private)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: ['slots', 'traffic'],
          description: 'Filter by type (optional)',
        },
        category: {
          type: 'string',
          enum: ['shared', 'private'],
          description: 'Filter by category (optional)',
        },
      },
      required: [] as string[],
    },
  },
  {
    name: 'purchase_shared_slots',
    description: 'Purchase shared port slots using account balance. Each slot allows you to create one shared proxy port.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        quantity: {
          type: 'number',
          description: 'Number of slots to purchase',
        },
      },
      required: ['quantity'],
    },
  },
  {
    name: 'purchase_shared_traffic',
    description: 'Purchase shared traffic in GB using account balance',
    inputSchema: {
      type: 'object' as const,
      properties: {
        quantityGB: {
          type: 'number',
          description: 'Amount of traffic in GB to purchase',
        },
      },
      required: ['quantityGB'],
    },
  },
  {
    name: 'purchase_private_slots',
    description: 'Purchase private port slots using account balance. Each slot allows you to create one private (dedicated) proxy port.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        quantity: {
          type: 'number',
          description: 'Number of slots to purchase',
        },
      },
      required: ['quantity'],
    },
  },
  {
    name: 'purchase_private_traffic',
    description: 'Purchase private traffic in GB using account balance',
    inputSchema: {
      type: 'object' as const,
      properties: {
        quantityGB: {
          type: 'number',
          description: 'Amount of traffic in GB to purchase',
        },
      },
      required: ['quantityGB'],
    },
  },
] as const;

/**
 * Billing tools handler
 */
export function createBillingToolHandlers(api: ProxiesApi) {
  return {
    async get_pricing(args: {
      type?: 'slots' | 'traffic';
      category?: 'shared' | 'private';
    }): Promise<string> {
      try {
        const tariffs = await api.billing.getTariffs();

        if (tariffs.length === 0) {
          return 'No pricing information available.';
        }

        // Filter out legacy tariffs and apply filters
        let filtered = tariffs.filter(t => t.category !== 'legacy');

        if (args.category) {
          filtered = filtered.filter(t => t.category === args.category);
        }

        if (args.type) {
          const resourceType = args.type === 'slots' ? 'ports' : 'traffic';
          filtered = filtered.filter(t => t.resourceType === resourceType);
        }

        if (filtered.length === 0) {
          return 'No pricing information available for the specified filters.';
        }

        // Group by category
        const shared = filtered.filter(t => t.category === 'shared');
        const private_ = filtered.filter(t => t.category === 'private');

        const lines = ['Current Pricing:'];

        if (shared.length > 0) {
          lines.push('\nShared:');
          // Sort by resource type (ports first, then traffic)
          const sortedShared = shared.sort((a, b) => {
            if (a.resourceType !== b.resourceType) {
              return a.resourceType === 'ports' ? -1 : 1;
            }
            return 0;
          });
          for (const tariff of sortedShared) {
            lines.push(`  ${formatTariff(tariff)}`);
          }
        }

        if (private_.length > 0) {
          lines.push('\nPrivate:');
          const sortedPrivate = private_.sort((a, b) => {
            if (a.resourceType !== b.resourceType) {
              return a.resourceType === 'ports' ? -1 : 1;
            }
            return 0;
          });
          for (const tariff of sortedPrivate) {
            lines.push(`  ${formatTariff(tariff)}`);
          }
        }

        return lines.join('\n');
      } catch (error) {
        throw new Error(`Failed to get pricing: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async purchase_shared_slots(args: { quantity: number }): Promise<string> {
      try {
        const result = await api.billing.purchaseSharedSlots(args.quantity);

        // Handle both wrapped and direct response formats
        const purchase = 'purchase' in result ? result.purchase : result;

        return [
          'Purchase successful!',
          '',
          `Purchased: ${args.quantity} shared slot(s)`,
          `Total: ${formatCurrency(purchase.totalPrice || 0)}`,
          `Type: ${purchase.type || 'PortsShared'}`,
        ].join('\n');
      } catch (error) {
        throw new Error(`Failed to purchase shared slots: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async purchase_shared_traffic(args: { quantityGB: number }): Promise<string> {
      try {
        const result = await api.billing.purchaseSharedTraffic(args.quantityGB);

        const purchase = 'purchase' in result ? result.purchase : result;

        return [
          'Purchase successful!',
          '',
          `Purchased: ${formatGB(args.quantityGB)} shared traffic`,
          `Total: ${formatCurrency(purchase.totalPrice || 0)}`,
          `Type: ${purchase.type || 'TrafficShared'}`,
        ].join('\n');
      } catch (error) {
        throw new Error(`Failed to purchase shared traffic: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async purchase_private_slots(args: { quantity: number }): Promise<string> {
      try {
        const result = await api.billing.purchasePrivateSlots(args.quantity);

        const purchase = 'purchase' in result ? result.purchase : result;

        return [
          'Purchase successful!',
          '',
          `Purchased: ${args.quantity} private slot(s)`,
          `Total: ${formatCurrency(purchase.totalPrice || 0)}`,
          `Type: ${purchase.type || 'PortsPrivate'}`,
        ].join('\n');
      } catch (error) {
        throw new Error(`Failed to purchase private slots: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async purchase_private_traffic(args: { quantityGB: number }): Promise<string> {
      try {
        const result = await api.billing.purchasePrivateTraffic(args.quantityGB);

        const purchase = 'purchase' in result ? result.purchase : result;

        return [
          'Purchase successful!',
          '',
          `Purchased: ${formatGB(args.quantityGB)} private traffic`,
          `Total: ${formatCurrency(purchase.totalPrice || 0)}`,
          `Type: ${purchase.type || 'TrafficPrivate'}`,
        ].join('\n');
      } catch (error) {
        throw new Error(`Failed to purchase private traffic: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

  };
}

/**
 * Zod schemas for validation
 */
export const billingSchemas = {
  get_pricing: z.object({
    type: z.enum(['slots', 'traffic']).optional(),
    category: z.enum(['shared', 'private']).optional(),
  }),
  purchase_shared_slots: z.object({
    quantity: z.number().min(1),
  }),
  purchase_shared_traffic: z.object({
    quantityGB: z.number().min(1),
  }),
  purchase_private_slots: z.object({
    quantity: z.number().min(1),
  }),
  purchase_private_traffic: z.object({
    quantityGB: z.number().min(1),
  }),
};
