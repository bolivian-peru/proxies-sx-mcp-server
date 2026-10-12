/**
 * Payment Tools
 * MCP tools for CoinGate crypto top-ups of the account balance
 *
 * Creating and cancelling an order need the billing:write scope, which only
 * reseller and admin keys can hold. A customer pays in the dashboard.
 */

import { z } from 'zod';
import type { ProxiesApi } from '../api/index.js';
import { formatCurrency } from '../utils/formatting.js';
import { readOnly, mutating, destructive } from './annotations.js';

const MIN_TOPUP_USD = 10;
const MAX_TOPUP_USD = 1000;
const NEEDS_BILLING_WRITE = 'Needs a key with the billing:write scope, which only reseller and admin keys can hold: a customer key gets 403, and a customer pays in the dashboard at https://client.proxies.sx/purchase.';

const orderId = { type: 'string', description: 'Order ID from create_crypto_payment or get_pending_crypto_payments' };

/**
 * Tool definitions for crypto payments
 */
export const paymentToolDefinitions = [
  {
    name: 'create_crypto_payment',
    annotations: mutating('Create Crypto Payment'),
    description: `Create a crypto order that tops up the account balance and return its hosted payment link. The balance is credited once the payment confirms on-chain. ${NEEDS_BILLING_WRITE}`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        amount: {
          type: 'number',
          minimum: MIN_TOPUP_USD,
          maximum: MAX_TOPUP_USD,
          description: `Amount to top up in USD (${MIN_TOPUP_USD}-${MAX_TOPUP_USD})`,
        },
      },
      required: ['amount'],
    },
  },
  {
    name: 'check_crypto_payment_status',
    annotations: readOnly('Check Crypto Payment Status'),
    description: 'Check whether a crypto order is still unpaid, confirming, paid, expired or cancelled, and whether the balance was credited. Scope billing:read.',
    inputSchema: { type: 'object' as const, properties: { orderId }, required: ['orderId'] },
  },
  {
    name: 'get_pending_crypto_payments',
    annotations: readOnly('Get Pending Crypto Payments'),
    description: 'List the account\'s crypto orders that are not finished yet, with their payment links. Scope billing:read.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
  {
    name: 'cancel_crypto_payment',
    annotations: destructive('Cancel Crypto Payment'),
    description: `Cancel a crypto order that has not been paid yet. ${NEEDS_BILLING_WRITE}`,
    inputSchema: { type: 'object' as const, properties: { orderId }, required: ['orderId'] },
  },
  {
    name: 'get_crypto_payment_info',
    annotations: readOnly('Get Crypto Payment Info'),
    description: 'Check whether crypto top-ups are available right now and which currencies the payment page accepts. No account needed.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
] as const;

const STATUS_MEANING: Record<string, string> = {
  new: 'Waiting for payment: open the payment link.',
  pending: 'Payment seen, waiting for confirmations.',
  confirming: 'Payment is confirming on-chain.',
  paid: 'Paid: the balance has been credited.',
  expired: 'Expired unpaid. Create a new order.',
  canceled: 'Cancelled.',
  invalid: 'There is a problem with this payment. Open a ticket with create_support_ticket.',
};

/**
 * Payment tools handler
 */
export function createPaymentToolHandlers(api: ProxiesApi) {
  return {
    async create_crypto_payment(args: { amount: number }): Promise<string> {
      try {
        const result = await api.payments.createCryptoOrder(args.amount);

        return [
          'Crypto order created.',
          '',
          `Amount: ${formatCurrency(result.amount)}`,
          `Order ID: ${result.orderId}`,
          `Status: ${result.status}`,
          '',
          'Payment link (choose the currency there, then send the exact amount shown):',
          result.paymentUrl,
          '',
          'The order expires if it stays unpaid. The balance is credited automatically after on-chain confirmation.',
          'Follow it with check_crypto_payment_status.',
        ].join('\n');
      } catch (error) {
        throw new Error(`Failed to create crypto payment: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async check_crypto_payment_status(args: { orderId: string }): Promise<string> {
      try {
        const result = await api.payments.getCryptoOrderStatus(args.orderId);

        const lines = [
          `Order ${result.orderId}: ${result.status}`,
          STATUS_MEANING[result.status] ?? '',
          `Amount: ${formatCurrency(result.priceAmount)}`,
        ];

        if (result.payCurrency && result.payAmount) {
          lines.push(`Crypto amount: ${result.payAmount} ${result.payCurrency}`);
        }
        if (result.balanceCredited) {
          lines.push(`Balance credited: ${formatCurrency(result.receiveAmount || result.priceAmount)}`);
        }
        if (result.paidAt) {
          lines.push(`Paid at: ${result.paidAt}`);
        }
        if (result.paymentUrl && ['new', 'pending'].includes(result.status)) {
          lines.push('', 'Payment link:', result.paymentUrl);
        }

        return lines.filter(Boolean).join('\n');
      } catch (error) {
        throw new Error(`Failed to check payment status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async get_pending_crypto_payments(): Promise<string> {
      try {
        const result = await api.payments.getPendingCryptoPayments();

        if (result.length === 0) {
          return 'No pending crypto payments on this account.';
        }

        const lines = [`Pending crypto payments (${result.length}):`];
        for (const order of result) {
          lines.push('', `Order: ${order.orderId}`, `  Amount: ${formatCurrency(order.priceAmount)}`, `  Status: ${order.status}`);
          if (order.paymentUrl) {
            lines.push(`  Payment link: ${order.paymentUrl}`);
          }
        }

        return lines.join('\n');
      } catch (error) {
        throw new Error(`Failed to get pending payments: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async cancel_crypto_payment(args: { orderId: string }): Promise<string> {
      try {
        const result = await api.payments.cancelCryptoOrder(args.orderId);
        return result.message || `Order ${args.orderId} has been cancelled.`;
      } catch (error) {
        throw new Error(`Failed to cancel payment: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async get_crypto_payment_info(): Promise<string> {
      try {
        const result = await api.payments.getCryptoPaymentStatus();

        if (!result.available) {
          return 'Crypto top-ups are not available right now. Pay by card in the dashboard at https://client.proxies.sx/purchase, or try again later.';
        }

        return [
          'Crypto top-ups are available (CoinGate hosted checkout).',
          `Accepted currencies: ${result.supportedCurrencies.join(', ')}`,
          `Order size: ${formatCurrency(MIN_TOPUP_USD)} to ${formatCurrency(MAX_TOPUP_USD)}.`,
          '',
          'A customer starts a top-up in the dashboard at https://client.proxies.sx/purchase.',
          'create_crypto_payment does the same through the API, for reseller and admin keys only.',
        ].join('\n');
      } catch (error) {
        throw new Error(`Failed to get payment info: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  };
}

/**
 * Zod schemas for validation
 */
export const paymentSchemas = {
  create_crypto_payment: z.object({
    amount: z.number().min(MIN_TOPUP_USD).max(MAX_TOPUP_USD),
  }),
  check_crypto_payment_status: z.object({
    orderId: z.string().min(1),
  }),
  get_pending_crypto_payments: z.object({}),
  cancel_crypto_payment: z.object({
    orderId: z.string().min(1),
  }),
  get_crypto_payment_info: z.object({}),
};
