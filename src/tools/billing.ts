/**
 * Billing Tools
 * MCP tools for pricing, purchases, coupons and payment history
 *
 * One product: metered traffic. Prices, volume discounts and slot tiers are
 * read from the API on every call, never written here. Time is free and port
 * slots are free (they unlock with cumulative GB purchased).
 */

import { z } from 'zod';
import type { ProxiesApi } from '../api/index.js';
import { formatCurrency, formatGB } from '../utils/formatting.js';
import { readOnly, mutating } from './annotations.js';

const COUPON_CODE = /^[A-Za-z0-9]{3,20}$/;
const COUPON_ORDER_TYPES = ['traffic', 'ports', 'all'] as const;

/**
 * Tool definitions for billing
 */
export const billingToolDefinitions = [
  {
    name: 'get_pricing',
    annotations: readOnly('Get Pricing'),
    description: 'Get the live price per GB, the volume discounts, the free port-slot tiers and your current tier. You pay for traffic only; time and port slots are free. Scope billing:read.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: 'calculate_price',
    annotations: readOnly('Calculate Price'),
    description: 'Calculate what a GB amount costs with the volume discount applied. Scope billing:read.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        amount: {
          type: 'number',
          minimum: 0.1,
          description: 'Amount of traffic in GB',
        },
      },
      required: ['amount'],
    },
  },
  {
    name: 'purchase_shared_traffic',
    annotations: mutating('Purchase Traffic'),
    description: 'Buy traffic in GB from the account balance. Needs a key with the billing:write scope, which only reseller and admin keys can hold: a customer key gets 403, and a customer buys in the dashboard at https://client.proxies.sx/purchase. Spends money.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        quantityGB: {
          type: 'number',
          minimum: 1,
          description: 'Amount of traffic in GB to purchase',
        },
        couponCode: {
          type: 'string',
          description: 'Optional coupon code (3-20 letters or digits); check it first with coupon_validate',
        },
      },
      required: ['quantityGB'],
    },
  },
  {
    name: 'coupon_validate',
    annotations: readOnly('Validate Coupon'),
    description: 'Check whether a coupon code is valid for an order, without using it. Returns valid true/false with the discount or the reason.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        code: { type: 'string', description: 'Coupon code (3-20 letters or digits)' },
        orderAmount: { type: 'number', minimum: 0, description: 'Order amount in USD to check the coupon against' },
        orderType: { type: 'string', enum: COUPON_ORDER_TYPES, description: 'What the order buys (default: traffic)' },
      },
      required: ['code', 'orderAmount'],
    },
  },
  {
    name: 'coupon_redeem',
    annotations: mutating('Redeem Coupon'),
    description: 'Redeem a standalone coupon that grants free GB or port slots to the account. A coupon that gives a discount on a purchase is not redeemed here: pass it as couponCode when buying.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        code: { type: 'string', description: 'Coupon code (3-20 letters or digits)' },
      },
      required: ['code'],
    },
  },
  {
    name: 'get_payment_history',
    annotations: readOnly('Get Payment History'),
    description: 'List the account\'s past payments and crypto top-up orders. Scope billing:read.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
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
          `Traffic: $${pricing.basePrices.shared.toFixed(2)}/GB before volume discount. Time is free.`,
          '',
          'Volume discounts (per purchase):',
        ];

        for (const discount of pricing.volumeDiscounts) {
          const range = discount.maxGB
            ? `${discount.minGB}-${discount.maxGB} GB`
            : `${discount.minGB}+ GB`;
          const perGB = pricing.basePrices.shared * (1 - discount.discountPercent / 100);
          lines.push(`  ${range}: ${discount.discountPercent}% off ($${perGB.toFixed(2)}/GB)`);
        }

        lines.push('', 'Free port slots by cumulative GB purchased:');
        for (const tier of pricing.slotTiers) {
          lines.push(`  ${tier.name} (${tier.minGB}+ GB): ${tier.sharedSlots} slots`);
        }

        if (pricing.userTierInfo) {
          lines.push('', 'Your tier:');
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
        const calculation = await api.billing.calculatePrice(args.amount);

        const lines = [
          `=== Price Calculation: ${args.amount} GB ===`,
          '',
          `Base Price: $${calculation.basePrice.toFixed(2)}/GB`,
          `Volume Discount: ${calculation.discountPercent}%`,
          `Price After Discount: $${calculation.pricePerGB.toFixed(2)}/GB`,
          '',
          `TOTAL: $${calculation.totalPrice.toFixed(2)}`,
        ];

        if (calculation.discountPercent > 0) {
          const savings = (calculation.basePrice * args.amount) - calculation.totalPrice;
          lines.push(`You Save: $${savings.toFixed(2)}`);
        }

        return lines.join('\n');
      } catch (error) {
        throw new Error(`Failed to calculate price: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async purchase_shared_traffic(args: { quantityGB: number; couponCode?: string }): Promise<string> {
      try {
        const purchase = await api.billing.purchaseTraffic(args.quantityGB, args.couponCode);

        return [
          'Purchase successful!',
          '',
          `Purchased: ${formatGB(purchase.amount ?? args.quantityGB)} of traffic`,
          `Charged: ${formatCurrency(purchase.price)}`,
          `Purchase ID: ${purchase._id}`,
        ].join('\n');
      } catch (error) {
        throw new Error(`Failed to purchase traffic: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async coupon_validate(args: { code: string; orderAmount: number; orderType?: string }): Promise<string> {
      try {
        const result = await api.billing.validateCoupon(args.code, args.orderAmount, args.orderType ?? 'traffic');
        return JSON.stringify(result, null, 2);
      } catch (error) {
        throw new Error(`Failed to validate coupon: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async coupon_redeem(args: { code: string }): Promise<string> {
      try {
        const result = await api.billing.redeemCoupon(args.code);
        return JSON.stringify(result, null, 2);
      } catch (error) {
        throw new Error(`Failed to redeem coupon: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async get_payment_history(): Promise<string> {
      try {
        const [payments, cryptoOrders] = await Promise.all([
          api.billing.getPayments(),
          api.payments.getCryptoPaymentHistory(),
        ]);

        if (payments.length === 0 && cryptoOrders.length === 0) {
          return 'No payments or crypto orders on this account yet.';
        }

        return JSON.stringify({ payments, cryptoOrders }, null, 2);
      } catch (error) {
        throw new Error(`Failed to get payment history: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    amount: z.number().min(0.1),
  }),
  purchase_shared_traffic: z.object({
    quantityGB: z.number().min(1),
    couponCode: z.string().regex(COUPON_CODE).optional(),
  }),
  coupon_validate: z.object({
    code: z.string().regex(COUPON_CODE),
    orderAmount: z.number().min(0),
    orderType: z.enum(COUPON_ORDER_TYPES).optional(),
  }),
  coupon_redeem: z.object({
    code: z.string().regex(COUPON_CODE),
  }),
  get_payment_history: z.object({}),
};
