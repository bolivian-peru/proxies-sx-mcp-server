/**
 * Billing Tools
 * MCP tools for purchases and pricing
 *
 * BUSINESS MODEL (2026):
 * - Shared-only product. One price: $4/GB. Slots are FREE, unlocked by tier
 *   based on cumulative GB purchases.
 * - Volume discounts: 10% at 25GB, 20% at 50GB, 30% at 100GB, 40% at 250GB
 * - Tiers: Starter (5 slots), Bronze (10), Silver (20), Gold (35), Platinum (50), Enterprise (80)
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
    description: 'Get current pricing: $4/GB (shared pool — the only tier), volume discounts (10-40%), slot tiers, and your current tier progression. Slots are FREE and unlock based on cumulative GB purchases.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: 'calculate_price',
    description: 'Calculate the price for a specific GB amount with volume discounts applied',
    inputSchema: {
      type: 'object' as const,
      properties: {
        amount: {
          type: 'number',
          description: 'Amount of traffic in GB to calculate price for ($4/GB before volume discount)',
        },
      },
      required: ['amount'],
    },
  },
  {
    name: 'purchase_shared_traffic',
    description: 'Purchase shared traffic in GB using account balance. Buying traffic also unlocks more FREE slot capacity based on tier thresholds.',
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
          '=== Proxies.sx Pricing ===',
          '',
          '📦 PRICE:',
          `  Traffic: $${pricing.basePrices.shared.toFixed(2)}/GB`,
          '',
          '🎁 SLOTS ARE FREE!',
          '  Slots unlock based on cumulative GB purchases.',
          '',
          '📊 VOLUME DISCOUNTS:',
        ];

        for (const discount of pricing.volumeDiscounts) {
          const range = discount.maxGB
            ? `${discount.minGB}-${discount.maxGB} GB`
            : `${discount.minGB}+ GB`;
          lines.push(`  ${range}: ${discount.discountPercent}% off`);
        }

        lines.push('', '🏆 SLOT TIERS:');
        for (const tier of pricing.slotTiers) {
          lines.push(`  ${tier.name} (${tier.minGB}+ GB): ${tier.sharedSlots} slots`);
        }

        if (pricing.userTierInfo) {
          lines.push('', '👤 YOUR TIER:');
          lines.push(`  Current: ${pricing.userTierInfo.currentTier.name}`);
          lines.push(`  Cumulative GB: ${pricing.userTierInfo.cumulativeGB.toFixed(1)} GB`);
          lines.push(`  Slots: ${pricing.userTierInfo.sharedSlotLimit}`);
          if (pricing.userTierInfo.nextTier) {
            lines.push(`  Next Tier: ${pricing.userTierInfo.nextTier.name} (${pricing.userTierInfo.gbToNextTier.toFixed(1)} GB more)`);
          }
        }

        return lines.join('\n');
      } catch (error) {
        throw new Error(`Failed to get pricing: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async calculate_price(args: { amount: number }): Promise<string> {
      try {
        const calculation = await api.billing.calculatePrice(args.amount, false);

        const lines = [
          `=== Price Calculation: ${args.amount} GB ===`,
          '',
          `Base Price: $${calculation.basePrice.toFixed(2)}/GB`,
          `Volume Discount: ${calculation.discountPercent}%`,
          `Price After Discount: $${calculation.pricePerGB.toFixed(2)}/GB`,
          '',
          `💰 TOTAL: $${calculation.totalPrice.toFixed(2)}`,
        ];

        if (calculation.discountPercent > 0) {
          const savings = (calculation.basePrice * args.amount) - calculation.totalPrice;
          lines.push(`💵 You Save: $${savings.toFixed(2)}`);
        }

        return lines.join('\n');
      } catch (error) {
        throw new Error(`Failed to calculate price: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async purchase_shared_traffic(args: { quantityGB: number }): Promise<string> {
      try {
        // Get current tier info before purchase
        let tierBefore: string | null = null;
        try {
          const pricingBefore = await api.billing.getPricing();
          tierBefore = pricingBefore.userTierInfo?.currentTier.name || null;
        } catch { /* ignore */ }

        const result = await api.billing.purchaseSharedTraffic(args.quantityGB);
        const purchase = 'purchase' in result ? result.purchase : result;

        // Get tier info after purchase
        let tierMessage = '';
        try {
          const pricingAfter = await api.billing.getPricing();
          const tierAfter = pricingAfter.userTierInfo?.currentTier.name || null;
          if (tierBefore && tierAfter && tierBefore !== tierAfter) {
            tierMessage = `\n🎉 TIER UPGRADED: ${tierBefore} → ${tierAfter}!`;
          } else if (pricingAfter.userTierInfo?.nextTier) {
            tierMessage = `\n📈 Progress: ${pricingAfter.userTierInfo.gbToNextTier.toFixed(1)} GB to ${pricingAfter.userTierInfo.nextTier.name}`;
          }
        } catch { /* ignore */ }

        return [
          '✅ Purchase successful!',
          '',
          `Purchased: ${formatGB(args.quantityGB)} shared traffic`,
          `Total: ${formatCurrency(purchase.totalPrice || 0)}`,
          tierMessage,
        ].filter(Boolean).join('\n');
      } catch (error) {
        throw new Error(`Failed to purchase shared traffic: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
  }),
  purchase_shared_traffic: z.object({
    quantityGB: z.number().min(1),
  }),
};
