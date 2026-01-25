/**
 * Billing Tools - NEW BUSINESS MODEL (January 2026)
 *
 * Changes from old model:
 * - REMOVED: purchase_shared_slots, purchase_private_slots (slots are now FREE!)
 * - UPDATED: get_pricing now uses /v1/billing/pricing endpoint with tiers
 * - ADDED: calculate_price tool for volume discount calculations
 * - KEPT: purchase_shared_traffic, purchase_private_traffic (but endpoints unchanged)
 *
 * Slots unlock automatically based on cumulative GB purchases:
 * - Starter (0 GB): 5 shared + 1 private
 * - Bronze (25 GB): 10 shared + 2 private
 * - Silver (50 GB): 20 shared + 4 private
 * - Gold (100 GB): 35 shared + 7 private
 * - Platinum (250 GB): 50 shared + 10 private
 * - Enterprise (500 GB): 80 shared + 15 private
 */

import { z } from 'zod';
import type { ProxiesApi } from '../api/index.js';
import { formatCurrency, formatGB } from '../utils/formatting.js';

/**
 * Tool definitions for billing
 */
export const billingToolDefinitions = [
  {
    name: 'get_pricing',
    description: 'Get current pricing information including base prices, volume discounts (10-40%), and slot tiers. Shows user\'s current tier and progress to next tier. NEW MODEL: Slots are FREE and unlock based on cumulative GB purchases.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: 'calculate_price',
    description: 'Calculate the exact price for a traffic purchase with volume discounts applied. Discounts: 10% at 25GB, 20% at 50GB, 30% at 100GB, 40% at 250GB+. Base prices: $4/GB shared, $8/GB private.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        amount: {
          type: 'number',
          description: 'Amount of GB to calculate price for',
        },
        isPrivate: {
          type: 'boolean',
          description: 'true for private traffic ($8/GB base), false for shared ($4/GB base)',
        },
      },
      required: ['amount', 'isPrivate'],
    },
  },
  {
    name: 'purchase_shared_traffic',
    description: 'Purchase shared traffic in GB using account balance. Base price: $4/GB with volume discounts (10-40%). Purchasing traffic may unlock higher slot tiers automatically.',
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
    name: 'purchase_private_traffic',
    description: 'Purchase private traffic in GB using account balance. Base price: $8/GB (2x shared) with volume discounts (10-40%). Purchasing traffic may unlock higher slot tiers automatically.',
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
    async get_pricing(): Promise<string> {
      try {
        const pricing = await api.billing.getPricing();

        const lines = [
          '=== Proxies.sx Pricing (NEW MODEL - FREE Slots!) ===',
          '',
          '📦 BASE PRICES:',
          `  Shared Traffic: ${formatCurrency(pricing.basePrices.shared)}/GB`,
          `  Private Traffic: ${formatCurrency(pricing.basePrices.private)}/GB`,
          '',
          '🎁 SLOTS ARE FREE!',
          '  Slots unlock based on cumulative GB purchases.',
          '  Once unlocked, slots never expire!',
          '',
          '📊 VOLUME DISCOUNTS:',
        ];

        for (const discount of pricing.volumeDiscounts) {
          const range = discount.maxGB
            ? `${discount.minGB}-${discount.maxGB} GB`
            : `${discount.minGB}+ GB`;
          lines.push(`  ${range}: ${discount.discountPercent}% off`);
        }

        lines.push('');
        lines.push('🏆 SLOT TIERS:');
        for (const tier of pricing.slotTiers) {
          lines.push(`  ${tier.name} (${tier.minGB}+ GB): ${tier.sharedSlots} shared + ${tier.privateSlots} private slots`);
        }

        if (pricing.userTierInfo) {
          const info = pricing.userTierInfo;
          lines.push('');
          lines.push('👤 YOUR TIER:');
          lines.push(`  Current: ${info.currentTier.name}`);
          lines.push(`  Cumulative GB: ${info.cumulativeGB.toFixed(1)} GB`);
          lines.push(`  Shared Slots: ${info.sharedSlotLimit}`);
          lines.push(`  Private Slots: ${info.privateSlotLimit}`);

          if (info.nextTier && info.gbToNextTier) {
            lines.push(`  Next Tier: ${info.nextTier.name} (${info.gbToNextTier.toFixed(1)} GB more)`);
          } else {
            lines.push('  🎉 Maximum tier reached!');
          }
        }

        return lines.join('\n');
      } catch (error) {
        throw new Error(`Failed to get pricing: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async calculate_price(args: { amount: number; isPrivate: boolean }): Promise<string> {
      try {
        const calc = await api.billing.calculatePrice(args.amount, args.isPrivate);

        const lines = [
          `=== Price Calculation: ${formatGB(calc.amount)} ${calc.isPrivate ? 'Private' : 'Shared'} ===`,
          '',
          `Base Price: ${formatCurrency(calc.basePrice)}/GB`,
          `Volume Discount: ${calc.discountPercent}%`,
          `Price After Discount: ${formatCurrency(calc.pricePerGB)}/GB`,
          '',
          `💰 TOTAL: ${formatCurrency(calc.totalPrice)}`,
        ];

        if (calc.discountPercent > 0) {
          const saved = (calc.basePrice * calc.amount) - calc.totalPrice;
          lines.push(`💵 You Save: ${formatCurrency(saved)}`);
        }

        return lines.join('\n');
      } catch (error) {
        throw new Error(`Failed to calculate price: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async purchase_shared_traffic(args: { quantityGB: number }): Promise<string> {
      try {
        const result = await api.billing.purchaseSharedTraffic(args.quantityGB);

        const purchase = 'purchase' in result ? result.purchase : result;

        const lines = [
          '✅ Purchase successful!',
          '',
          `Purchased: ${formatGB(args.quantityGB)} shared traffic`,
          `Total: ${formatCurrency(purchase.totalPrice || 0)}`,
          `Type: ${purchase.type || 'TrafficShared'}`,
        ];

        // Check if tier upgrade info is available (future enhancement)
        if ('tierUpgrade' in result && result.tierUpgrade && typeof result.tierUpgrade === 'object') {
          const upgrade = result.tierUpgrade as any;
          lines.push('');
          lines.push('🎉 TIER UPGRADED!');
          lines.push(`  Old Tier: ${upgrade.oldTier}`);
          lines.push(`  New Tier: ${upgrade.newTier}`);
          lines.push(`  New Slots: ${upgrade.newSlots.shared} shared + ${upgrade.newSlots.private} private`);
        }

        return lines.join('\n');
      } catch (error) {
        throw new Error(`Failed to purchase shared traffic: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async purchase_private_traffic(args: { quantityGB: number }): Promise<string> {
      try {
        const result = await api.billing.purchasePrivateTraffic(args.quantityGB);

        const purchase = 'purchase' in result ? result.purchase : result;

        const lines = [
          '✅ Purchase successful!',
          '',
          `Purchased: ${formatGB(args.quantityGB)} private traffic`,
          `Total: ${formatCurrency(purchase.totalPrice || 0)}`,
          `Type: ${purchase.type || 'TrafficPrivate'}`,
        ];

        // Check if tier upgrade info is available (future enhancement)
        if ('tierUpgrade' in result && result.tierUpgrade && typeof result.tierUpgrade === 'object') {
          const upgrade = result.tierUpgrade as any;
          lines.push('');
          lines.push('🎉 TIER UPGRADED!');
          lines.push(`  Old Tier: ${upgrade.oldTier}`);
          lines.push(`  New Tier: ${upgrade.newTier}`);
          lines.push(`  New Slots: ${upgrade.newSlots.shared} shared + ${upgrade.newSlots.private} private`);
        }

        return lines.join('\n');
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
  get_pricing: z.object({}),
  calculate_price: z.object({
    amount: z.number().min(1),
    isPrivate: z.boolean(),
  }),
  purchase_shared_traffic: z.object({
    quantityGB: z.number().min(1),
  }),
  purchase_private_traffic: z.object({
    quantityGB: z.number().min(1),
  }),
};
