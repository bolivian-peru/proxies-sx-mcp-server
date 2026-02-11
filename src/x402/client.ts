/**
 * x402 Protocol Client
 * Handles x402 payment flow: 402 → Pay → Verify → Access
 */

import type { AgentWallet } from './wallet.js';
import type {
  X402Network,
  X402Tier,
  X402PaymentRequirement,
  X402AcceptOption,
  X402ProxyResponse,
  X402Session,
  X402Pricing,
} from './types.js';

/**
 * Pricing rates by tier - Duration is FREE, pay only for traffic
 */
const PRICING_RATES: Record<X402Tier, { perGB: number }> = {
  shared: { perGB: 4.0 },
  private: { perGB: 8.0 },
};

/**
 * x402 Protocol Client
 * Manages the full x402 payment flow for purchasing proxies
 */
export class X402Client {
  private wallet: AgentWallet;
  private baseUrl: string;
  private preferredNetwork: X402Network;

  constructor(
    wallet: AgentWallet,
    baseUrl: string = 'https://api.proxies.sx/v1',
    preferredNetwork: X402Network = 'base'
  ) {
    this.wallet = wallet;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.preferredNetwork = preferredNetwork;
  }

  /**
   * Calculate pricing for a proxy configuration
   */
  calculatePricing(params: {
    durationHours: number;
    trafficGB: number;
    tier?: X402Tier;
  }): X402Pricing {
    const tier = params.tier || 'shared';
    const rates = PRICING_RATES[tier];

    const trafficCost = params.trafficGB * rates.perGB;

    return {
      tier,
      trafficRatePerGB: rates.perGB,
      totalCost: trafficCost,
      breakdown: {
        trafficCost,
        trafficGB: params.trafficGB,
      },
    };
  }

  /**
   * Get pricing from API (more accurate, includes country-specific pricing)
   */
  async getPricingFromApi(params: {
    country: string;
    duration: number;
    traffic: number;
    tier?: X402Tier;
  }): Promise<X402Pricing> {
    const url = new URL(`${this.baseUrl}/x402/pricing`);
    url.searchParams.set('country', params.country);
    url.searchParams.set('duration', String(params.duration));
    url.searchParams.set('traffic', String(params.traffic));
    if (params.tier) {
      url.searchParams.set('tier', params.tier);
    }

    try {
      const response = await fetch(url.toString());
      if (!response.ok) {
        // Fall back to local calculation
        return this.calculatePricing({
          durationHours: params.duration / 3600,
          trafficGB: params.traffic,
          tier: params.tier,
        });
      }
      return response.json() as Promise<X402Pricing>;
    } catch {
      // Fall back to local calculation
      return this.calculatePricing({
        durationHours: params.duration / 3600,
        trafficGB: params.traffic,
        tier: params.tier,
      });
    }
  }

  /**
   * Request a proxy and get 402 payment requirement
   */
  private async getPaymentRequirement(params: {
    country: string;
    duration: number;
    traffic: number;
    tier?: X402Tier;
    city?: string;
    carrier?: string;
  }): Promise<{ requirement: X402PaymentRequirement; url: string }> {
    const url = new URL(`${this.baseUrl}/x402/proxy`);
    url.searchParams.set('country', params.country);
    url.searchParams.set('duration', String(params.duration));
    url.searchParams.set('traffic', String(params.traffic));

    if (params.tier) url.searchParams.set('tier', params.tier);
    if (params.city) url.searchParams.set('city', params.city);
    if (params.carrier) url.searchParams.set('carrier', params.carrier);

    const response = await fetch(url.toString());

    if (response.status !== 402) {
      const body = await response.text();
      throw new Error(
        `Expected 402 Payment Required, got ${response.status}: ${body}`
      );
    }

    const data = await response.json() as { paymentRequirement?: X402PaymentRequirement };

    if (!data.paymentRequirement) {
      throw new Error('Missing paymentRequirement in 402 response');
    }

    return {
      requirement: data.paymentRequirement,
      url: url.toString(),
    };
  }

  /**
   * Find the best payment option for our preferred network
   */
  private findPaymentOption(
    requirement: X402PaymentRequirement
  ): X402AcceptOption {
    // Try preferred network first
    const preferred = requirement.accepts.find(
      (a) => a.network === this.preferredNetwork
    );
    if (preferred) return preferred;

    // Fall back to first available
    if (requirement.accepts.length > 0) {
      return requirement.accepts[0];
    }

    throw new Error('No payment options available in 402 response');
  }

  /**
   * Submit payment proof and get proxy credentials
   */
  private async submitPaymentProof(
    url: string,
    transactionHash: string,
    network: X402Network
  ): Promise<X402ProxyResponse> {
    const paymentProof = {
      transactionHash,
      network,
      payer: this.wallet.address,
    };

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Payment': JSON.stringify(paymentProof),
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' })) as { message?: string };
      throw new Error(
        `Payment verification failed (${response.status}): ${error.message || JSON.stringify(error)}`
      );
    }

    return response.json() as Promise<X402ProxyResponse>;
  }

  /**
   * Purchase a proxy via x402 payment
   * This is the main method that handles the full flow:
   * 1. Request proxy (get 402)
   * 2. Pay USDC on-chain
   * 3. Retry with payment proof
   * 4. Return proxy credentials
   */
  async purchaseProxy(params: {
    country: string;
    durationHours?: number;
    trafficGB?: number;
    tier?: X402Tier;
    city?: string;
    carrier?: string;
  }): Promise<X402ProxyResponse> {
    const durationHours = params.durationHours || 1;
    const trafficGB = params.trafficGB || 1;
    const duration = durationHours * 3600;

    // Step 1: Get payment requirement
    const { requirement, url } = await this.getPaymentRequirement({
      country: params.country,
      duration,
      traffic: trafficGB,
      tier: params.tier,
      city: params.city,
      carrier: params.carrier,
    });

    // Step 2: Find payment option
    const paymentOption = this.findPaymentOption(requirement);

    // Step 3: Check if we have sufficient balance
    const hasBalance = await this.wallet.hasSufficientBalance(
      paymentOption.maxAmountRequired
    );

    if (!hasBalance) {
      const balance = await this.wallet.getBalance();
      const required = Number(paymentOption.maxAmountRequired) / 1e6;
      throw new Error(
        `Insufficient USDC balance. Required: $${required.toFixed(2)}, Available: ${balance.formatted}. ` +
        `Please top up wallet: ${this.wallet.address}`
      );
    }

    // Step 4: Send USDC payment
    const transfer = await this.wallet.sendUSDC(
      paymentOption.payTo,
      paymentOption.maxAmountRequired
    );

    // Step 5: Submit payment proof and get proxy
    const result = await this.submitPaymentProof(
      url,
      transfer.transactionHash,
      transfer.network
    );

    return result;
  }

  /**
   * List sessions for this wallet
   */
  async listSessions(
    status: 'active' | 'expired' | 'all' = 'active'
  ): Promise<X402Session[]> {
    const url = new URL(`${this.baseUrl}/x402/sessions/wallet/${this.wallet.address}`);
    url.searchParams.set('status', status);

    const response = await fetch(url.toString());

    if (!response.ok) {
      if (response.status === 404) {
        return []; // No sessions found
      }
      const error = await response.json().catch(() => ({ message: 'Unknown error' })) as { message?: string };
      throw new Error(`Failed to list sessions: ${error.message || 'Unknown error'}`);
    }

    const data = await response.json() as { sessions?: X402Session[] } | X402Session[];
    return Array.isArray(data) ? data : (data.sessions || []);
  }

  /**
   * Get session status by ID
   */
  async getSessionStatus(sessionId: string): Promise<X402Session> {
    const url = `${this.baseUrl}/x402/sessions/${sessionId}/status`;

    const response = await fetch(url);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' })) as { message?: string };
      throw new Error(`Failed to get session status: ${error.message || 'Unknown error'}`);
    }

    return response.json() as Promise<X402Session>;
  }

  /**
   * Extend a session by paying more USDC
   */
  async extendSession(
    sessionId: string,
    additionalHours: number
  ): Promise<X402Session> {
    // First get current session to verify it exists
    await this.getSessionStatus(sessionId);

    // Calculate extension cost (just time, no additional traffic)
    const url = new URL(`${this.baseUrl}/x402/sessions/${sessionId}/extend`);
    url.searchParams.set('hours', String(additionalHours));

    // Get payment requirement for extension
    const response = await fetch(url.toString(), { method: 'POST' });

    if (response.status !== 402) {
      throw new Error(`Expected 402 for extension, got ${response.status}`);
    }

    const extensionData = await response.json() as { paymentRequirement: X402PaymentRequirement };
    const paymentOption = this.findPaymentOption(extensionData.paymentRequirement);

    // Pay for extension
    const transfer = await this.wallet.sendUSDC(
      paymentOption.payTo,
      paymentOption.maxAmountRequired
    );

    // Submit payment proof
    const extendResponse = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'X-Payment': JSON.stringify({
          transactionHash: transfer.transactionHash,
          network: transfer.network,
          payer: this.wallet.address,
        }),
      },
    });

    if (!extendResponse.ok) {
      throw new Error('Failed to extend session');
    }

    return extendResponse.json() as Promise<X402Session>;
  }

  /**
   * Get available countries for proxy selection
   */
  async getCountries(): Promise<{ code: string; name: string }[]> {
    const url = `${this.baseUrl}/countries`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('Failed to fetch countries');
    }

    return response.json() as Promise<{ code: string; name: string }[]>;
  }

  /**
   * Get wallet address
   */
  getWalletAddress(): string {
    return this.wallet.address;
  }

  /**
   * Get preferred network
   */
  getPreferredNetwork(): X402Network {
    return this.preferredNetwork;
  }
}

/**
 * Create an x402 client instance
 */
export function createX402Client(
  wallet: AgentWallet,
  baseUrl?: string,
  preferredNetwork?: X402Network
): X402Client {
  return new X402Client(wallet, baseUrl, preferredNetwork);
}
