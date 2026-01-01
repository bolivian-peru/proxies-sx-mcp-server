/**
 * API Module - Main Export
 * Combines all API modules into a single client
 */

import { ApiClient, createApiClient, type ApiClientConfig } from './client.js';
import { AccountApi } from './account.js';
import { PortsApi } from './ports.js';
import { RotationApi } from './rotation.js';
import { BillingApi } from './billing.js';
import { ReferenceApi } from './reference.js';
import { PaymentsApi } from './payments.js';

export * from './types.js';
export * from './client.js';
export * from './auth.js';
export { AccountApi } from './account.js';
export { PortsApi } from './ports.js';
export { RotationApi } from './rotation.js';
export { BillingApi } from './billing.js';
export { ReferenceApi } from './reference.js';
export { PaymentsApi } from './payments.js';

/**
 * Combined Proxies.sx API Client
 */
export class ProxiesApi {
  public readonly client: ApiClient;
  public readonly account: AccountApi;
  public readonly ports: PortsApi;
  public readonly rotation: RotationApi;
  public readonly billing: BillingApi;
  public readonly reference: ReferenceApi;
  public readonly payments: PaymentsApi;

  constructor(config: ApiClientConfig) {
    this.client = createApiClient(config);
    this.account = new AccountApi(this.client);
    this.ports = new PortsApi(this.client);
    this.rotation = new RotationApi(this.client);
    this.billing = new BillingApi(this.client);
    this.reference = new ReferenceApi(this.client);
    this.payments = new PaymentsApi(this.client);
  }
}

/**
 * Create Proxies.sx API client
 */
export function createProxiesApi(config: ApiClientConfig): ProxiesApi {
  return new ProxiesApi(config);
}
