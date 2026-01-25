/**
 * Billing API Module
 * Endpoints for purchases and tariffs
 */

import type { ApiClient } from './client.js';
import type {
  Tariff,
  Purchase,
  PurchaseResponse,
  PaginatedResponse,
  PricingInfo,
  PriceCalculation,
} from './types.js';

export interface PurchaseParams {
  type: 'slots' | 'traffic';
  category: 'shared' | 'private';
  quantity: number;
}

export class BillingApi {
  constructor(private readonly client: ApiClient) {}

  // ============================================================================
  // NEW BUSINESS MODEL: Pricing & Tier System (January 2026)
  // ============================================================================

  /**
   * Get complete pricing information (NEW MODEL)
   * Includes base prices, volume discounts, slot tiers, and user's current tier
   * Required scope: billing:read
   * Endpoint: GET /v1/billing/pricing
   */
  async getPricing(): Promise<PricingInfo> {
    return this.client.get<PricingInfo>('/v1/billing/pricing');
  }

  /**
   * Calculate price with volume discount (NEW MODEL)
   * Required scope: billing:read
   * Endpoint: GET /v1/billing/calculate-price
   */
  async calculatePrice(amount: number, isPrivate: boolean): Promise<PriceCalculation> {
    return this.client.get<PriceCalculation>('/v1/billing/calculate-price', {
      amount: amount.toString(),
      isPrivate: isPrivate.toString(),
    });
  }

  // ============================================================================
  // DEPRECATED: Old Tariff System (use getPricing() instead)
  // ============================================================================

  /**
   * Get all available tariffs
   * Required scope: billing:read
   * @deprecated Use getPricing() instead - returns new pricing model with tiers and volume discounts
   */
  async getTariffs(): Promise<Tariff[]> {
    return this.client.get<Tariff[]>('/v1/tariffs');
  }

  /**
   * Get tariffs by type and category
   * Required scope: billing:read
   */
  async getTariffsFiltered(type?: 'slots' | 'traffic', category?: 'shared' | 'private'): Promise<Tariff[]> {
    return this.client.get<Tariff[]>('/v1/tariffs', { type, category });
  }

  /**
   * Calculate price for a purchase (OLD METHOD - client-side calculation)
   * @deprecated Use calculatePrice() instead - calls backend API with volume discounts
   */
  calculatePriceFromTariffs(tariffs: Tariff[], params: PurchaseParams): number | null {
    // Map params to backend's resourceType
    const resourceType = params.type === 'slots' ? 'ports' : 'traffic';

    // Find matching tariff based on category and resourceType
    const matchingTariff = tariffs.find(t => {
      // Skip legacy tariffs
      if (t.category === 'legacy') return false;

      // Match category and resource type
      if (t.category !== params.category) return false;
      if (t.resourceType !== resourceType) return false;

      // Check quantity range
      const range = resourceType === 'ports' ? t.portRange : t.trafficRange;
      if (!range) return true; // No range restriction

      const min = range.min || 1;
      const max = range.max || Infinity;
      return params.quantity >= min && params.quantity <= max;
    });

    if (!matchingTariff) {
      return null;
    }

    return matchingTariff.pricePerUnit * params.quantity;
  }

  // ============================================================================
  // DEPRECATED: Slot Purchases (Slots are now FREE in new model)
  // ============================================================================

  /**
   * Purchase shared slots (port slots)
   * Required scope: billing:write
   * Endpoint: POST /v1/billing/purchase-ports
   * @deprecated SLOTS ARE NOW FREE! Slots unlock automatically based on cumulative GB purchases.
   *             Use purchaseSharedTraffic() to buy traffic, which will automatically upgrade your tier.
   */
  async purchaseSharedSlots(_quantity: number): Promise<PurchaseResponse> {
    throw new Error('Slot purchases are deprecated. Slots are now FREE and unlock based on traffic purchases. Use purchaseSharedTraffic() instead.');
  }

  /**
   * Purchase shared traffic (in GB)
   * Required scope: billing:write
   * Endpoint: POST /v1/billing/purchase-traffic
   */
  async purchaseSharedTraffic(quantityGB: number): Promise<PurchaseResponse> {
    return this.client.post<PurchaseResponse>('/v1/billing/purchase-traffic', {
      amount: quantityGB,
    });
  }

  /**
   * Purchase private slots (port slots)
   * Required scope: billing:write
   * Endpoint: POST /v1/billing/purchase-ports-private
   * @deprecated SLOTS ARE NOW FREE! Slots unlock automatically based on cumulative GB purchases.
   *             Use purchasePrivateTraffic() to buy traffic, which will automatically upgrade your tier.
   */
  async purchasePrivateSlots(_quantity: number): Promise<PurchaseResponse> {
    throw new Error('Slot purchases are deprecated. Slots are now FREE and unlock based on traffic purchases. Use purchasePrivateTraffic() instead.');
  }

  /**
   * Purchase private traffic (in GB)
   * Required scope: billing:write
   * Endpoint: POST /v1/billing/purchase-traffic-private
   */
  async purchasePrivateTraffic(quantityGB: number): Promise<PurchaseResponse> {
    return this.client.post<PurchaseResponse>('/v1/billing/purchase-traffic-private', {
      amount: quantityGB,
    });
  }

  /**
   * Get purchase history
   * Required scope: billing:read
   */
  async getPurchases(params?: {
    limit?: number;
    offset?: number;
    type?: 'slots' | 'traffic';
    category?: 'shared' | 'private';
  }): Promise<PaginatedResponse<Purchase>> {
    return this.client.get<PaginatedResponse<Purchase>>('/v1/purchases', {
      limit: params?.limit ?? 20,
      offset: params?.offset ?? 0,
      type: params?.type,
      category: params?.category,
    });
  }

  /**
   * Get purchase by ID
   * Required scope: billing:read
   */
  async getPurchase(purchaseId: string): Promise<Purchase> {
    return this.client.get<Purchase>(`/v1/purchases/${purchaseId}`);
  }
}
