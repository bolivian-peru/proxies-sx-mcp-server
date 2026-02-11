/**
 * Billing API Module
 * Endpoints for purchases and tariffs
 *
 * BUSINESS MODEL UPDATE (Jan 2026):
 * - Slots are now FREE, unlocked by tier based on cumulative GB purchases
 * - Slot purchase endpoints are deprecated (kept for backward compatibility)
 * - Use getPricing() and calculatePrice() for new pricing info
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
  // NEW PRICING ENDPOINTS (Jan 2026 Business Model)
  // ============================================================================

  /**
   * Get complete pricing information including:
   * - Base prices ($4/GB shared, $8/GB private)
   * - Volume discounts (10%, 20%, 30%, 40% based on purchase amount)
   * - Slot tiers (Starter, Bronze, Silver, Gold, Platinum, Enterprise)
   * - Current user's tier info
   *
   * Required scope: billing:read
   */
  async getPricing(): Promise<PricingInfo> {
    return this.client.get<PricingInfo>('/v1/billing/pricing');
  }

  /**
   * Calculate price for a given GB amount with volume discounts applied
   *
   * Required scope: billing:read
   *
   * @param amount - Number of GB to calculate price for
   * @param isPrivate - true for private traffic, false for shared
   */
  async calculatePrice(amount: number, isPrivate: boolean = false): Promise<PriceCalculation> {
    return this.client.get<PriceCalculation>('/v1/billing/calculate-price', {
      amount,
      isPrivate,
    });
  }

  /**
   * Get all available tariffs
   * Required scope: billing:read
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
   * @deprecated Use calculatePrice() for the new pricing model with volume discounts.
   * Calculate price for a purchase using legacy tariffs
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

  /**
   * @deprecated Slots are now FREE! Use getPricing() to see tier progression.
   * Slots unlock automatically based on cumulative GB purchases.
   *
   * Purchase shared slots (port slots)
   * Required scope: billing:write
   * Endpoint: POST /v1/billing/purchase-ports
   */
  async purchaseSharedSlots(quantity: number): Promise<PurchaseResponse> {
    console.warn('[DEPRECATED] purchaseSharedSlots: Slots are now FREE! They unlock based on cumulative GB purchases. Use getPricing() to see tier progression.');
    return this.client.post<PurchaseResponse>('/v1/billing/purchase-ports', {
      amount: quantity,
    });
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
   * @deprecated Slots are now FREE! Use getPricing() to see tier progression.
   * Slots unlock automatically based on cumulative GB purchases.
   *
   * Purchase private slots (port slots)
   * Required scope: billing:write
   * Endpoint: POST /v1/billing/purchase-ports-private
   */
  async purchasePrivateSlots(quantity: number): Promise<PurchaseResponse> {
    console.warn('[DEPRECATED] purchasePrivateSlots: Slots are now FREE! They unlock based on cumulative GB purchases. Use getPricing() to see tier progression.');
    return this.client.post<PurchaseResponse>('/v1/billing/purchase-ports-private', {
      amount: quantity,
    });
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
