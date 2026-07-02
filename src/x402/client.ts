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
  X402TopupResult,
  X402PoolResponse,
  X402PoolCredit,
  X402PoolPricing,
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
   * Resolve the API base that always includes the `/v1` prefix.
   * The MCP server constructs this client with `https://api.proxies.sx`
   * (no `/v1`), so versioned routes must add it explicitly.
   */
  private v1Base(): string {
    return /\/v1$/.test(this.baseUrl) ? this.baseUrl : `${this.baseUrl}/v1`;
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
   * Extend a session's duration via the real top-up route.
   * Duration-only top-ups are FREE on the backend, so no USDC is sent.
   *
   * Route: POST /v1/x402/manage/session/topup
   * Auth:  X-Session-Token: x402s_...
   * Note:  the backend requires a non-empty Payment-Signature header even
   *        for $0 duration-only top-ups; the value is ignored when cost is 0.
   */
  async extendSession(
    sessionToken: string,
    additionalHours: number
  ): Promise<X402TopupResult> {
    const addDurationSeconds = Math.round(additionalHours * 3600);

    const response = await fetch(`${this.v1Base()}/x402/manage/session/topup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Token': sessionToken,
        // Required non-empty by the backend; unused for free duration-only top-ups
        'Payment-Signature': 'duration-only',
      },
      body: JSON.stringify({ addDurationSeconds }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' })) as { message?: string };
      throw new Error(
        `Failed to extend session (${response.status}): ${error.message || 'Unknown error'}`
      );
    }

    return response.json() as Promise<X402TopupResult>;
  }

  // ============ Pool Gateway Access ============

  /**
   * Get the Pool Gateway tier catalog (no auth, no wallet needed)
   */
  async getPoolPricing(): Promise<X402PoolPricing> {
    const response = await fetch(`${this.v1Base()}/x402/pool/pricing`);
    if (!response.ok) {
      throw new Error(`Failed to fetch pool pricing: ${response.status}`);
    }
    return response.json() as Promise<X402PoolPricing>;
  }

  /**
   * Buy Pool Gateway access via x402 payment.
   * Flow: GET /v1/x402/pool (402 catalog) -> pay USDC on-chain -> retry with Payment-Signature.
   */
  async purchasePoolAccess(params: {
    country?: string;
    trafficGB?: number;
    tier?: string;
    sid?: string;
    rot?: string;
  }): Promise<X402PoolResponse> {
    const trafficGB = params.trafficGB || 1;
    const tier = params.tier || 'mbl';

    const url = new URL(`${this.v1Base()}/x402/pool`);
    url.searchParams.set('tier', tier);
    if (params.country) url.searchParams.set('country', params.country);
    url.searchParams.set('traffic', String(trafficGB));
    if (params.sid) url.searchParams.set('sid', params.sid);
    if (params.rot) url.searchParams.set('rot', params.rot);

    // Step 1: Get 402 payment requirement (the 402 IS the catalog)
    const initial = await fetch(url.toString());
    if (initial.status !== 402) {
      // Some configs may provision directly; if already 2xx, return it
      if (initial.ok) {
        return initial.json() as Promise<X402PoolResponse>;
      }
      const body = await initial.text();
      throw new Error(`Expected 402 Payment Required, got ${initial.status}: ${body}`);
    }

    const data = await initial.json() as { paymentRequirement?: X402PaymentRequirement };
    if (!data.paymentRequirement) {
      throw new Error('Missing paymentRequirement in 402 pool response');
    }

    // Step 2: Pick a payment option for our network
    const paymentOption = this.findPaymentOption(data.paymentRequirement);

    // Step 3: Ensure sufficient balance
    const hasBalance = await this.wallet.hasSufficientBalance(paymentOption.maxAmountRequired);
    if (!hasBalance) {
      const balance = await this.wallet.getBalance();
      const required = Number(paymentOption.maxAmountRequired) / 1e6;
      throw new Error(
        `Insufficient USDC balance. Required: $${required.toFixed(2)}, Available: ${balance.formatted}. ` +
        `Please top up wallet: ${this.wallet.address}`
      );
    }

    // Step 4: Pay USDC on-chain
    const transfer = await this.wallet.sendUSDC(
      paymentOption.payTo,
      paymentOption.maxAmountRequired
    );

    // Step 5: Retry with Payment-Signature header
    const paid = await fetch(url.toString(), {
      headers: { 'Payment-Signature': transfer.transactionHash },
    });

    if (!paid.ok) {
      const error = await paid.json().catch(() => ({ message: 'Unknown error' })) as { message?: string };
      throw new Error(
        `Pool access provisioning failed (${paid.status}): ${error.message || JSON.stringify(error)}`
      );
    }

    return paid.json() as Promise<X402PoolResponse>;
  }

  /**
   * Read remaining pool credit (pak-backed) for a session token
   */
  async getPoolCredit(sessionToken: string): Promise<X402PoolCredit> {
    const response = await fetch(`${this.v1Base()}/x402/manage/pool/credit`, {
      headers: { 'X-Session-Token': sessionToken },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' })) as { message?: string };
      throw new Error(`Failed to fetch pool credit (${response.status}): ${error.message || 'Unknown error'}`);
    }
    return response.json() as Promise<X402PoolCredit>;
  }

  /**
   * Re-emit the pool proxy credentials (recovery)
   */
  async getPoolConnection(sessionToken: string): Promise<X402PoolResponse> {
    const response = await fetch(`${this.v1Base()}/x402/manage/pool/connection`, {
      headers: { 'X-Session-Token': sessionToken },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' })) as { message?: string };
      throw new Error(`Failed to fetch pool connection (${response.status}): ${error.message || 'Unknown error'}`);
    }
    return response.json() as Promise<X402PoolResponse>;
  }

  /**
   * Get per-day usage (MB) for a pool session
   */
  async getPoolUsage(sessionToken: string, days?: number): Promise<{ tier?: string; days?: number; usage: Array<{ date: string; mb: number }> }> {
    const url = new URL(`${this.v1Base()}/x402/manage/pool/usage`);
    if (days) url.searchParams.set('days', String(days));
    const response = await fetch(url.toString(), {
      headers: { 'X-Session-Token': sessionToken },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' })) as { message?: string };
      throw new Error(`Failed to fetch pool usage (${response.status}): ${error.message || 'Unknown error'}`);
    }
    return response.json() as Promise<{ tier?: string; days?: number; usage: Array<{ date: string; mb: number }> }>;
  }

  /**
   * Top up a pool session with more GB and/or duration.
   * Duration-only is free; traffic requires an on-chain payment + Payment-Signature.
   */
  async topUpPool(
    sessionToken: string,
    params: { addTrafficGB?: number; addDurationSeconds?: number }
  ): Promise<X402PoolCredit> {
    const body: Record<string, number> = {};
    if (params.addTrafficGB) body.addTrafficGB = params.addTrafficGB;
    if (params.addDurationSeconds) body.addDurationSeconds = params.addDurationSeconds;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Session-Token': sessionToken,
    };

    // Paid top-up (traffic): ask the route for its 402 quote (authoritative,
    // priced at the session's frozen mint-time rate), pay USDC, then retry
    // with the Payment-Signature attached.
    if (params.addTrafficGB && params.addTrafficGB > 0) {
      const quoteRes = await fetch(`${this.v1Base()}/x402/manage/pool/topup`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (quoteRes.status !== 402) {
        // No payment demanded (or a hard error) - surface it directly
        if (quoteRes.ok) {
          return quoteRes.json() as Promise<X402PoolCredit>;
        }
        const error = await quoteRes.json().catch(() => ({ message: 'Unknown error' })) as { message?: string };
        throw new Error(`Pool top-up failed (${quoteRes.status}): ${error.message || 'Unknown error'}`);
      }

      const quoteBody = await quoteRes.json() as {
        paymentRequirement?: X402PaymentRequirement & { amountUSDC?: number };
      };
      const requirement = quoteBody.paymentRequirement;

      let payTo: string | undefined;
      let amountMicro: string | undefined;
      if (requirement && Array.isArray(requirement.accepts) && requirement.accepts.length > 0) {
        const option = this.findPaymentOption(requirement);
        payTo = option.payTo;
        // amountUSDC in the 402 body is the frozen session-tier price; prefer it
        amountMicro = requirement.amountUSDC !== undefined
          ? String(Math.ceil(Number(requirement.amountUSDC) * 1e6))
          : option.maxAmountRequired;
      }

      // Fallback: derive from the public catalog if the 402 was not parseable
      if (!payTo || !amountMicro) {
        const pricing = await this.getPoolPricing();
        const tiers = pricing.tiers || [];
        const tierEntry = tiers.find((t) => t.tier === pricing.defaultTier) || tiers[0];
        const pricePerGB = tierEntry?.pricePerGB ?? 4;
        amountMicro = String(Math.ceil(params.addTrafficGB * pricePerGB * 1e6));
        payTo = this.resolvePoolPayTo(pricing);
        if (!payTo) {
          throw new Error('Could not resolve pool top-up recipient address from /v1/x402/pool/pricing networks');
        }
      }

      const transfer = await this.wallet.sendUSDC(payTo, amountMicro);
      headers['Payment-Signature'] = transfer.transactionHash;
    }

    const response = await fetch(`${this.v1Base()}/x402/manage/pool/topup`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' })) as { message?: string };
      throw new Error(`Pool top-up failed (${response.status}): ${error.message || 'Unknown error'}`);
    }

    return response.json() as Promise<X402PoolCredit>;
  }

  /**
   * Rotate the pool credential secret (same username, new pak password)
   */
  async regeneratePool(sessionToken: string): Promise<X402PoolResponse> {
    const response = await fetch(`${this.v1Base()}/x402/manage/pool/regenerate`, {
      method: 'POST',
      headers: { 'X-Session-Token': sessionToken },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' })) as { message?: string };
      throw new Error(`Pool regenerate failed (${response.status}): ${error.message || 'Unknown error'}`);
    }
    return response.json() as Promise<X402PoolResponse>;
  }

  /**
   * Resolve the on-chain recipient address for a pool top-up from the catalog networks.
   * The backend's network entries carry `recipientAddress`; older shapes may use
   * payTo/recipient/address, so all are accepted. Picks the entry matching the
   * wallet's preferred network when present.
   */
  private resolvePoolPayTo(pricing: X402PoolPricing): string | undefined {
    const networks = (pricing.networks || []) as Array<Record<string, unknown>>;
    if (networks.length === 0) return undefined;
    const wanted = this.preferredNetwork;
    const match = networks.find((n) => String(n.network || '').toLowerCase() === wanted) || networks[0];
    const addr = (match.recipientAddress || match.payTo || match.recipient || match.address) as string | undefined;
    return addr;
  }

  /**
   * Get public Pool Gateway stock (counts per country, no IPs)
   */
  async getPoolStock(): Promise<unknown> {
    const response = await fetch(`${this.v1Base()}/gateway/pool/stock`);
    if (!response.ok) {
      throw new Error(`Failed to fetch pool stock: ${response.status}`);
    }
    return response.json();
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
