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
} from './types.js';

export interface PurchaseParams {
  type: 'slots' | 'traffic';
  category: 'shared' | 'private';
  quantity: number;
}

export class BillingApi {
  constructor(private readonly client: ApiClient) {}

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
   * Calculate price for a purchase
   */
  calculatePrice(tariffs: Tariff[], params: PurchaseParams): number | null {
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
   * Purchase shared slots (port slots)
   * Required scope: billing:write
   * Endpoint: POST /v1/billing/purchase-ports
   */
  async purchaseSharedSlots(quantity: number): Promise<PurchaseResponse> {
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
   * Purchase private slots (port slots)
   * Required scope: billing:write
   * Endpoint: POST /v1/billing/purchase-ports-private
   */
  async purchasePrivateSlots(quantity: number): Promise<PurchaseResponse> {
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
