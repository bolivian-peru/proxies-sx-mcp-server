/**
 * Billing API Module
 * Endpoints for pricing, purchases, coupons and payment history
 *
 * One product: metered traffic at the price GET /v1/billing/pricing returns,
 * with volume discounts. Port slots are free and unlock with cumulative GB.
 */

import type { ApiClient } from './client.js';
import type { PricingInfo, PriceCalculation, Purchase } from './types.js';

export class BillingApi {
  constructor(private readonly client: ApiClient) {}

  /**
   * Get base price, volume discounts, slot tiers and the caller's tier
   * Required scope: billing:read
   */
  async getPricing(): Promise<PricingInfo> {
    return this.client.get<PricingInfo>('/v1/billing/pricing');
  }

  /**
   * Calculate the price for a GB amount with volume discounts applied
   * Required scope: billing:read
   */
  async calculatePrice(amount: number): Promise<PriceCalculation> {
    return this.client.get<PriceCalculation>('/v1/billing/calculate-price', { amount });
  }

  /**
   * Purchase traffic (in GB) from the account balance
   * Required scope: billing:write (reseller and admin keys only)
   */
  async purchaseTraffic(quantityGB: number, couponCode?: string): Promise<Purchase> {
    return this.client.post<Purchase>('/v1/billing/purchase-traffic', {
      amount: quantityGB,
      couponCode,
    });
  }

  /**
   * Check a coupon against an order without using it
   */
  async validateCoupon(code: string, orderAmount: number, orderType: string): Promise<unknown> {
    return this.client.post('/v1/coupons/validate', { code, orderAmount, orderType });
  }

  /**
   * Redeem a standalone coupon (free GB or slots)
   */
  async redeemCoupon(code: string): Promise<unknown> {
    return this.client.post('/v1/coupons/redeem', { code });
  }

  /**
   * Get card and balance payments
   * Required scope: billing:read
   */
  async getPayments(): Promise<unknown[]> {
    return this.client.get<unknown[]>('/v1/billing/payments');
  }
}
