/**
 * Private Modems API Module
 * One dedicated 4G/5G modem per rental, unlimited traffic, paid from the
 * account balance. Retail prices come from the catalog; the hardware supplier
 * is never named in any response.
 *
 * Buying and renewing are idempotent per `Idempotency-Key`: the same key with
 * the same body returns the same order, so a retry never buys twice.
 */

import type { ApiClient } from './client.js';

export type ModemPeriod = 'day' | 'week' | 'month';
export type ModemOrderStatus = 'pending' | 'succeeded' | 'failed';

export interface ModemRegion {
  id: string;
  name: string;
  stock: number;
  p0f: boolean;
}

export interface ModemTariff {
  tariffId: string;
  period: ModemPeriod;
  countryCode: string;
  countryName: string;
  carrierId: string;
  carrierName: string;
  stock: number;
  priceUsd: number;
  openvpn: boolean;
  p0f: boolean;
  p0fStock: number;
  regions: ModemRegion[];
}

export interface ModemCatalog {
  maxCartModems: number;
  tariffs: ModemTariff[];
}

export interface ModemOrder {
  orderId: string;
  kind: 'buy' | 'renew';
  status: ModemOrderStatus;
  priceUsd: number;
  modemId: string | null;
  countryName: string;
  carrierName: string;
  period: ModemPeriod;
  quantity: number;
  regionName: string | null;
  createdAt: string;
  error: string | null;
  refunded: boolean;
}

export interface ModemCartItem {
  tariffId: string;
  quantity: number;
  expectedPriceUsd: number;
  regionId?: string;
  p0f?: boolean;
}

export interface ModemCartResult {
  cartId: string;
  orders: ModemOrder[];
}

export interface ModemCredential {
  host: string;
  port: number;
  username: string;
  password: string;
}

export interface Modem {
  id: string;
  status: string;
  countryCode: string;
  countryName: string;
  carrierName: string;
  period: ModemPeriod;
  regionName: string | null;
  expiresAt: string;
  online: boolean;
  notAnswering: boolean;
  /** The exit IP of the caller's own rented modem. Shown to the owner only. */
  currentIp: string | null;
  rotationInterval: number | null;
  credentials: { http: ModemCredential; socks5: ModemCredential | null };
  capabilities: Record<string, boolean>;
  rotationToken: string | null;
  autoRenew: boolean;
  autoRenewIssue: string | null;
  autoRenewPeriod: ModemPeriod | null;
}

export interface MyModems {
  liveError: string | null;
  openOrders: ModemOrder[];
  recentFailed: ModemOrder[];
  modems: Modem[];
}

export interface RenewalOption {
  period: ModemPeriod;
  days: number;
  priceUsd: number;
  available: boolean;
  reason: string | null;
  extendsTo: string | null;
}

export interface RenewalQuote {
  defaultPeriod: ModemPeriod;
  days: number;
  priceUsd: number;
  options: RenewalOption[];
}

export interface ModemRotateResult {
  rotated: boolean;
  pending: boolean;
  message: string;
}

const idempotency = (key: string) => ({ 'Idempotency-Key': key });

export class PrivateModemsApi {
  constructor(private readonly client: ApiClient) {}

  /** Live plans with stock and retail price. Any key. */
  async getCatalog(): Promise<ModemCatalog> {
    return this.client.get<ModemCatalog>('/v1/private-modems/catalog');
  }

  /** Rented modems with credentials, plus open and recently failed orders. Any key. */
  async getMine(): Promise<MyModems> {
    return this.client.get<MyModems>('/v1/private-modems/mine');
  }

  /** Price of each renewal period for one modem. Any key. */
  async getRenewalQuote(modemId: string): Promise<RenewalQuote> {
    return this.client.get<RenewalQuote>(`/v1/private-modems/${modemId}/renewal-quote`);
  }

  /**
   * Buy one modem. Required scope: modems:purchase
   */
  async buy(idempotencyKey: string, tariffId: string, expectedPriceUsd: number, confirmAgain?: boolean): Promise<ModemOrder> {
    return this.client.post<ModemOrder>('/v1/private-modems/orders', { tariffId, expectedPriceUsd, confirmAgain }, undefined, idempotency(idempotencyKey));
  }

  /**
   * Buy a cart: several modems of one plan, or a region or p0f choice. Required scope: modems:purchase
   */
  async buyCart(idempotencyKey: string, items: ModemCartItem[], confirmAgain?: boolean): Promise<ModemCartResult> {
    return this.client.post<ModemCartResult>('/v1/private-modems/orders', { items, confirmAgain }, undefined, idempotency(idempotencyKey));
  }

  /**
   * Extend a rental. Required scope: modems:purchase
   */
  async renew(idempotencyKey: string, modemId: string, expectedPriceUsd: number, period?: ModemPeriod, confirmAgain?: boolean): Promise<ModemOrder> {
    return this.client.post<ModemOrder>(`/v1/private-modems/${modemId}/renew`, { expectedPriceUsd, period, confirmAgain }, undefined, idempotency(idempotencyKey));
  }

  /** Ask the modem for a new IP. Any key. */
  async rotate(modemId: string): Promise<ModemRotateResult> {
    return this.client.post<ModemRotateResult>(`/v1/private-modems/${modemId}/rotate`);
  }
}
