/**
 * Payments API Module
 * Endpoints for CoinGate crypto payments and card top-ups (Stripe Checkout)
 */

import type { ApiClient } from './client.js';

export interface CreateOrderResponse {
  orderId: string;
  coingateOrderId: number;
  paymentUrl: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
}

export interface OrderStatus {
  orderId: string;
  coingateOrderId?: number;
  status: string;
  priceAmount: number;
  priceCurrency: string;
  receiveAmount?: number;
  payAmount?: number;
  payCurrency?: string;
  paymentUrl?: string;
  balanceCredited: boolean;
  createdAt: string;
  paidAt?: string;
}

export interface CryptoPaymentStatus {
  available: boolean;
  supportedCurrencies: string[];
}

export interface BalanceCheckout {
  /** Stripe-hosted Checkout page. A person opens it and pays by card. */
  url: string;
  sessionId: string;
}

export interface BalanceCheckoutReceipt {
  /** true once the session is paid and the balance was credited (sessions under 24 h old). */
  credited: boolean;
  payment_receipt?: Record<string, unknown>;
}

export class PaymentsApi {
  constructor(private readonly client: ApiClient) {}

  /**
   * Create a crypto payment order
   * Required scope: billing:write
   */
  async createCryptoOrder(amount: number, currency: string = 'USD'): Promise<CreateOrderResponse> {
    return this.client.post<CreateOrderResponse>('/v1/coingate/create-order', {
      amount,
      currency,
    });
  }

  /**
   * Get crypto order status
   * Required scope: billing:read
   */
  async getCryptoOrderStatus(orderId: string): Promise<OrderStatus> {
    return this.client.get<OrderStatus>(`/v1/coingate/order/${orderId}`);
  }

  /**
   * Get pending crypto payments
   * Required scope: billing:read
   */
  async getPendingCryptoPayments(): Promise<OrderStatus[]> {
    return this.client.get<OrderStatus[]>('/v1/coingate/pending');
  }

  /**
   * Get crypto payment history
   * Required scope: billing:read
   */
  async getCryptoPaymentHistory(): Promise<OrderStatus[]> {
    return this.client.get<OrderStatus[]>('/v1/coingate/history');
  }

  /**
   * Cancel a pending crypto payment
   * Required scope: billing:write
   */
  async cancelCryptoOrder(orderId: string): Promise<{ success: boolean; message: string }> {
    return this.client.post<{ success: boolean; message: string }>(`/v1/coingate/cancel/${orderId}`);
  }

  /**
   * Start a card top-up of the balance: returns a Stripe Checkout link a person pays
   * Required scope: billing:topup (daily cap per key: spendCapUsdPerDay)
   */
  async createBalanceCheckout(amount: number): Promise<BalanceCheckout> {
    return this.client.post<BalanceCheckout>('/v1/stripe/create-balance-checkout', { amount });
  }

  /**
   * Whether a card top-up session was paid and credited
   * Required scope: billing:topup
   */
  async getBalanceCheckoutReceipt(sessionId: string): Promise<BalanceCheckoutReceipt> {
    return this.client.get<BalanceCheckoutReceipt>(`/v1/stripe/balance-checkout/${sessionId}/receipt`);
  }

  /**
   * Check if crypto payments are available
   * Public endpoint
   */
  async getCryptoPaymentStatus(): Promise<CryptoPaymentStatus> {
    return this.client.get<CryptoPaymentStatus>('/v1/coingate/status');
  }
}
