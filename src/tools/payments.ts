/**
 * Payment Tools
 * MCP tools that top up the account balance: by card through a Stripe
 * Checkout link a person pays (proxies_topup_*), or in crypto through CoinGate.
 *
 * Card top-ups need an API key with the billing:topup scope and stay under the
 * key's daily cap. Creating and cancelling a crypto order need billing:write,
 * which only reseller and admin keys can hold. A customer pays in the dashboard.
 */

import { z } from 'zod';
import { ApiClientError, type ProxiesApi } from '../api/index.js';
import { formatCurrency } from '../utils/formatting.js';
import { readOnly, mutating, destructive, spending } from './annotations.js';
import { confirmProperty, requireConfirm, structured, type StructuredResult } from './structured.js';

const MIN_TOPUP_USD = 10;
const MAX_TOPUP_USD = 1000;
const MIN_CARD_TOPUP_USD = 1;
const NEEDS_BILLING_WRITE = 'Needs a key with the billing:write scope, which only reseller and admin keys can hold: a customer key gets 403, and a customer pays in the dashboard at https://client.proxies.sx/purchase.';

const orderId = { type: 'string', description: 'Order ID from create_crypto_payment or get_pending_crypto_payments' };
const sessionId = { type: 'string', description: 'sessionId returned by proxies_topup_checkout' };

/**
 * Tool definitions for payments
 */
export const paymentToolDefinitions = [
  {
    name: 'proxies_topup_checkout',
    annotations: spending('Top Up Balance by Card'),
    description: 'Add money to the account balance by card: creates a Stripe Checkout page and returns its url and sessionId. A human must open the url in a browser and pay; this tool and the agent cannot pay it. ' +
      'The balance is credited after payment; the balance then pays for Private modems (proxies_modem_buy) and, in the dashboard, for GB. amountUsd is whole US dollars, at least 1. ' +
      'Spends money: call it only after the user agreed to the exact amount and set confirm: true. Then poll proxies_topup_status about every 10 s for up to 15 min. ' +
      'Needs an API key with the billing:topup scope (ticked in the dashboard API keys section); each key has a daily cap (spendCapUsdPerDay, default 100 USD, reset at 00:00 UTC): spend_cap_reached means wait for the reset or raise the cap in the dashboard. ' +
      'Not for crypto (create_crypto_payment) or x402 wallets. Example: {"amountUsd": 20, "confirm": true}.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        amountUsd: { type: 'integer', minimum: MIN_CARD_TOPUP_USD, description: 'Amount to add in whole USD (at least 1)' },
        confirm: confirmProperty,
      },
      required: ['amountUsd'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Stripe Checkout page for a person to open and pay' },
        sessionId: { type: 'string' },
        amountUsd: { type: 'number' },
        next: { type: 'string' },
      },
      required: ['url', 'sessionId', 'amountUsd', 'next'],
    },
  },
  {
    name: 'proxies_topup_status',
    annotations: readOnly('Top-Up Status'),
    description: 'Check whether a card top-up started with proxies_topup_checkout was paid and credited to the balance (credited true or false). Poll about every 10 s for up to 15 min after giving the user the url; once credited, read the balance with get_account_summary. ' +
      'Sessions older than 24 h are not reported. Needs the billing:topup scope. Example: {"sessionId": "cs_..."}.',
    inputSchema: { type: 'object' as const, properties: { sessionId }, required: ['sessionId'] },
    outputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        credited: { type: 'boolean' },
        next: { type: 'string' },
      },
      required: ['sessionId', 'credited', 'next'],
    },
  },
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
    async proxies_topup_checkout(args: { amountUsd: number; confirm?: boolean }): Promise<StructuredResult> {
      requireConfirm(args.confirm, 'charged');
      try {
        const checkout = await api.payments.createBalanceCheckout(args.amountUsd);
        const next = 'A person must open the url and pay by card; the agent cannot. Then poll proxies_topup_status with this sessionId about every 10 s for up to 15 min.';
        return structured({ url: checkout.url, sessionId: checkout.sessionId, amountUsd: args.amountUsd, next }, `Card top-up of ${formatCurrency(args.amountUsd)} prepared. ${next}`);
      } catch (error) {
        // The route answers 404 until the API offers card top-ups to API keys
        if (error instanceof ApiClientError && error.statusCode === 404) {
          throw new Error('The API does not offer card top-ups to API keys yet. Ask the user to add money in the dashboard at https://client.proxies.sx/purchase, then read get_account_summary.');
        }
        throw error;
      }
    },

    async proxies_topup_status(args: { sessionId: string }): Promise<StructuredResult> {
      const receipt = await api.payments.getBalanceCheckoutReceipt(args.sessionId);
      const next = receipt.credited
        ? 'The balance is credited: read it with get_account_summary and continue the purchase.'
        : 'Not paid yet. Ask the user to finish the payment page, and poll again in about 10 s (give up after 15 min).';
      return structured({ sessionId: args.sessionId, credited: receipt.credited, next }, next);
    },

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
  proxies_topup_checkout: z.object({
    amountUsd: z.number().int().min(MIN_CARD_TOPUP_USD),
    confirm: z.boolean().optional(),
  }),
  proxies_topup_status: z.object({
    sessionId: z.string().min(1).max(200),
  }),
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
