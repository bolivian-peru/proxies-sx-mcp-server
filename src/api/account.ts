/**
 * Account API Module
 * Endpoints for account information and usage
 */

import type { ApiClient } from './client.js';
import type { AccountSummary, TrafficBalanceBreakdown, TrafficUsage } from './types.js';

export class AccountApi {
  constructor(private readonly client: ApiClient) {}

  /**
   * Get account summary with balance and resources
   * Required scope: account:read
   */
  async getSummary(): Promise<AccountSummary> {
    return this.client.get<AccountSummary>('/v1/account/summary');
  }

  /**
   * Get traffic balance breakdown
   * Required scope: traffic:read
   */
  async getTrafficBreakdown(): Promise<TrafficBalanceBreakdown> {
    return this.client.get<TrafficBalanceBreakdown>('/v1/traffic/balance-breakdown');
  }

  /**
   * Get metered traffic per port; the Pool Gateway is the row with portId 'gw_pool'
   * Required scope: traffic:read
   */
  async getTrafficUsage(): Promise<TrafficUsage> {
    return this.client.get<TrafficUsage>('/v1/traffic/usage');
  }
}
