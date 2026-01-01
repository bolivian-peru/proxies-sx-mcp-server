/**
 * Payment Tools
 * MCP tools for CoinGate crypto payments
 */

import { z } from 'zod';
import type { ProxiesApi } from '../api/index.js';
import { formatCurrency } from '../utils/formatting.js';

/**
 * Tool definitions for crypto payments
 */
export const paymentToolDefinitions = [
  {
    name: 'create_crypto_payment',
    description: 'Create a crypto payment order to top up balance. Returns a payment URL where the user can pay with BTC, ETH, USDT, and 50+ other cryptocurrencies. After payment, balance is credited automatically.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        amount: {
          type: 'number',
          description: 'Amount to top up in USD (10-1000)',
        },
      },
      required: ['amount'],
    },
  },
  {
    name: 'check_crypto_payment_status',
    description: 'Check the status of a crypto payment order',
    inputSchema: {
      type: 'object' as const,
      properties: {
        orderId: {
          type: 'string',
          description: 'The order ID to check (e.g., topup_abc123_1702134567890)',
        },
      },
      required: ['orderId'],
    },
  },
  {
    name: 'get_pending_crypto_payments',
    description: 'Get all pending crypto payments (new, pending, or confirming status)',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: 'cancel_crypto_payment',
    description: 'Cancel a pending crypto payment order. Only orders with "new" status (awaiting payment) can be canceled.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        orderId: {
          type: 'string',
          description: 'The order ID to cancel',
        },
      },
      required: ['orderId'],
    },
  },
  {
    name: 'get_crypto_payment_info',
    description: 'Get information about crypto payment availability and supported currencies',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  },
] as const;

/**
 * Payment tools handler
 */
export function createPaymentToolHandlers(api: ProxiesApi) {
  return {
    async create_crypto_payment(args: { amount: number }): Promise<string> {
      try {
        const result = await api.payments.createCryptoOrder(args.amount);

        return [
          '═══════════════════════════════════════════════════════════════',
          '                    CRYPTO PAYMENT ORDER CREATED',
          '═══════════════════════════════════════════════════════════════',
          '',
          `Amount to Pay: ${formatCurrency(result.amount)} USD`,
          `Order ID: ${result.orderId}`,
          `Status: ${result.status.toUpperCase()}`,
          '',
          '───────────────────────────────────────────────────────────────',
          '                      PAYMENT LINK',
          '───────────────────────────────────────────────────────────────',
          '',
          result.paymentUrl,
          '',
          '───────────────────────────────────────────────────────────────',
          '                    HOW TO PAY',
          '───────────────────────────────────────────────────────────────',
          '',
          '1. OPEN the payment link above in your browser',
          '2. SELECT your cryptocurrency (BTC, ETH, USDT, LTC, etc.)',
          '3. COPY the wallet address shown on the payment page',
          '4. SEND the exact crypto amount to that address',
          '5. WAIT for blockchain confirmation (5-30 minutes)',
          '6. Balance credited automatically when confirmed!',
          '',
          '───────────────────────────────────────────────────────────────',
          '                 IMPORTANT NOTES',
          '───────────────────────────────────────────────────────────────',
          '',
          '• The wallet address is shown AFTER you select a cryptocurrency',
          '• Each order generates a UNIQUE address - do not reuse addresses',
          '• Send the EXACT amount shown - underpayments may not be credited',
          '• Order expires in ~60 minutes if unpaid',
          '',
          '───────────────────────────────────────────────────────────────',
          '               SUPPORTED CRYPTOCURRENCIES',
          '───────────────────────────────────────────────────────────────',
          '',
          'BTC (Bitcoin), ETH (Ethereum), USDT (Tether), USDC, LTC,',
          'DOGE, TRX, XRP, ADA, SOL, MATIC, AVAX, DOT, LINK, UNI, SHIB',
          '',
          '═══════════════════════════════════════════════════════════════',
          '',
          `To check payment status: check_crypto_payment_status("${result.orderId}")`,
        ].join('\n');
      } catch (error) {
        throw new Error(`Failed to create crypto payment: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async check_crypto_payment_status(args: { orderId: string }): Promise<string> {
      try {
        const result = await api.payments.getCryptoOrderStatus(args.orderId);

        // Status icons and descriptions
        const statusInfo: Record<string, { icon: string; description: string; action: string }> = {
          new: {
            icon: '⏳',
            description: 'AWAITING PAYMENT',
            action: 'Open the payment link and complete payment',
          },
          pending: {
            icon: '🔄',
            description: 'PAYMENT DETECTED',
            action: 'Transaction found on blockchain, waiting for confirmations...',
          },
          confirming: {
            icon: '⛏️',
            description: 'CONFIRMING ON BLOCKCHAIN',
            action: 'Please wait, blockchain is confirming your transaction...',
          },
          paid: {
            icon: '✅',
            description: 'PAYMENT CONFIRMED',
            action: 'Your balance has been credited!',
          },
          expired: {
            icon: '❌',
            description: 'ORDER EXPIRED',
            action: 'This order has expired. Create a new payment order.',
          },
          canceled: {
            icon: '🚫',
            description: 'ORDER CANCELED',
            action: 'This order was canceled.',
          },
          invalid: {
            icon: '⚠️',
            description: 'PAYMENT ISSUE',
            action: 'There was an issue with this payment. Please contact support.',
          },
        };

        const info = statusInfo[result.status] || { icon: '❓', description: result.status.toUpperCase(), action: '' };

        const lines = [
          '═══════════════════════════════════════════════════════════════',
          `              ${info.icon} PAYMENT STATUS: ${info.description}`,
          '═══════════════════════════════════════════════════════════════',
          '',
          `Order ID: ${result.orderId}`,
          `Amount: ${formatCurrency(result.priceAmount)} USD`,
        ];

        if (result.payCurrency && result.payAmount) {
          lines.push(`Crypto Amount: ${result.payAmount} ${result.payCurrency}`);
        }

        if (result.balanceCredited) {
          lines.push('');
          lines.push(`✅ Balance Credited: ${formatCurrency(result.receiveAmount || result.priceAmount)}`);
        }

        if (result.paidAt) {
          lines.push(`Paid At: ${result.paidAt}`);
        }

        lines.push('');
        lines.push('───────────────────────────────────────────────────────────────');
        lines.push(`${info.action}`);
        lines.push('───────────────────────────────────────────────────────────────');

        if (result.paymentUrl && ['new', 'pending'].includes(result.status)) {
          lines.push('');
          lines.push('Payment Link:');
          lines.push(result.paymentUrl);
        }

        return lines.join('\n');
      } catch (error) {
        throw new Error(`Failed to check payment status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async get_pending_crypto_payments(): Promise<string> {
      try {
        const result = await api.payments.getPendingCryptoPayments();

        if (result.length === 0) {
          return [
            '═══════════════════════════════════════════════════════════════',
            '                    NO PENDING PAYMENTS',
            '═══════════════════════════════════════════════════════════════',
            '',
            'You have no pending crypto payments.',
            '',
            'To top up your balance with crypto:',
            '  Use: create_crypto_payment(amount)',
            '  Example: create_crypto_payment(50) for $50 top-up',
          ].join('\n');
        }

        const lines = [
          '═══════════════════════════════════════════════════════════════',
          `                 PENDING PAYMENTS (${result.length})`,
          '═══════════════════════════════════════════════════════════════',
        ];

        for (const order of result) {
          lines.push('');
          lines.push(`📋 Order: ${order.orderId}`);
          lines.push(`   Amount: ${formatCurrency(order.priceAmount)} USD`);
          lines.push(`   Status: ${order.status.toUpperCase()}`);
          if (order.paymentUrl) {
            lines.push(`   Pay Here: ${order.paymentUrl}`);
          }
        }

        lines.push('');
        lines.push('───────────────────────────────────────────────────────────────');
        lines.push('To check status: check_crypto_payment_status("ORDER_ID")');
        lines.push('To cancel: cancel_crypto_payment("ORDER_ID")');

        return lines.join('\n');
      } catch (error) {
        throw new Error(`Failed to get pending payments: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async cancel_crypto_payment(args: { orderId: string }): Promise<string> {
      try {
        const result = await api.payments.cancelCryptoOrder(args.orderId);
        return [
          '═══════════════════════════════════════════════════════════════',
          '                    PAYMENT CANCELED',
          '═══════════════════════════════════════════════════════════════',
          '',
          `Order ${args.orderId} has been canceled.`,
          '',
          result.message || 'The payment link will expire automatically.',
          '',
          'To create a new payment: create_crypto_payment(amount)',
        ].join('\n');
      } catch (error) {
        throw new Error(`Failed to cancel payment: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async get_crypto_payment_info(): Promise<string> {
      try {
        const result = await api.payments.getCryptoPaymentStatus();

        if (!result.available) {
          return [
            '═══════════════════════════════════════════════════════════════',
            '              ❌ CRYPTO PAYMENTS UNAVAILABLE',
            '═══════════════════════════════════════════════════════════════',
            '',
            'Crypto payments are currently not available.',
            'Please try again later or use card payment.',
          ].join('\n');
        }

        return [
          '═══════════════════════════════════════════════════════════════',
          '              💰 CRYPTO PAYMENTS - HOW IT WORKS',
          '═══════════════════════════════════════════════════════════════',
          '',
          '✅ STATUS: Available',
          '',
          '───────────────────────────────────────────────────────────────',
          '                    PAYMENT LIMITS',
          '───────────────────────────────────────────────────────────────',
          '',
          'Minimum: $10 USD',
          'Maximum: $1000 USD',
          '',
          '───────────────────────────────────────────────────────────────',
          '              SUPPORTED CRYPTOCURRENCIES',
          '───────────────────────────────────────────────────────────────',
          '',
          '• Bitcoin (BTC)          • Ethereum (ETH)',
          '• Tether (USDT)          • USD Coin (USDC)',
          '• Litecoin (LTC)         • Dogecoin (DOGE)',
          '• TRON (TRX)             • Ripple (XRP)',
          '• Cardano (ADA)          • Solana (SOL)',
          '• Polygon (MATIC)        • Avalanche (AVAX)',
          '• Polkadot (DOT)         • Chainlink (LINK)',
          '• Uniswap (UNI)          • Shiba Inu (SHIB)',
          '',
          '───────────────────────────────────────────────────────────────',
          '                    HOW TO PAY',
          '───────────────────────────────────────────────────────────────',
          '',
          '1. CREATE ORDER:  create_crypto_payment(50)  [for $50]',
          '2. OPEN LINK:     Click the payment URL in the response',
          '3. SELECT CRYPTO: Choose your preferred cryptocurrency',
          '4. GET ADDRESS:   Copy the wallet address shown',
          '5. SEND PAYMENT:  Send exact amount from your wallet',
          '6. WAIT:          5-30 minutes for confirmation',
          '7. DONE:          Balance credited automatically!',
          '',
          '───────────────────────────────────────────────────────────────',
          '                    OTHER COMMANDS',
          '───────────────────────────────────────────────────────────────',
          '',
          '• check_crypto_payment_status("ORDER_ID") - Check payment status',
          '• get_pending_crypto_payments()           - List pending payments',
          '• cancel_crypto_payment("ORDER_ID")       - Cancel pending order',
          '',
          '═══════════════════════════════════════════════════════════════',
          '              Provider: CoinGate (Secure Hosted Checkout)',
          '═══════════════════════════════════════════════════════════════',
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
    amount: z.number().min(10).max(1000),
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
