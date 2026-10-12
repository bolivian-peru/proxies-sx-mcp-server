/**
 * x402 Protocol Client
 * Handles x402 payment flow: 402 → Pay → Verify → Access
 */

import type { AgentWallet } from './wallet.js';
import type {
  X402PaymentRequirement,
  X402AcceptOption,
  X402ProxyResponse,
  X402Session,
  X402ProxyPricing,
  X402Country,
  X402TopupResult,
  X402PoolResponse,
  X402PoolCredit,
  X402PoolPricing,
  TransferResult,
} from './types.js';

/**
 * The 402 answer carries the payment requirement at the top level
 * ({ x402Version, accepts, ... }); older builds nested it under
 * `paymentRequirement`. Both are read.
 */
function readPaymentRequirement(body: unknown): X402PaymentRequirement & { amountUSDC?: number } {
  const data = body as { paymentRequirement?: X402PaymentRequirement } & Partial<X402PaymentRequirement>;
  const requirement = data.paymentRequirement ?? data;
  if (!Array.isArray(requirement.accepts) || requirement.accepts.length === 0) {
    throw new Error('The 402 response carried no payment options');
  }
  return requirement as X402PaymentRequirement;
}

/**
 * x402 Protocol Client
 * Manages the full x402 payment flow for purchasing proxies
 */
export class X402Client {
  private wallet: AgentWallet;
  private baseUrl: string;

  constructor(
    wallet: AgentWallet,
    baseUrl: string = 'https://api.proxies.sx'
  ) {
    this.wallet = wallet;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * The API base including the `/v1` prefix every route lives under,
   * whichever way the base URL was configured.
   */
  private v1Base(): string {
    return /\/v1$/.test(this.baseUrl) ? this.baseUrl : `${this.baseUrl}/v1`;
  }

  /**
   * Request a proxy and get 402 payment requirement
   */
  private async getPaymentRequirement(params: {
    country: string;
    duration: number;
    traffic: number;
    city?: string;
    carrier?: string;
  }): Promise<{ requirement: X402PaymentRequirement; url: string }> {
    const url = new URL(`${this.v1Base()}/x402/proxy`);
    url.searchParams.set('country', params.country);
    url.searchParams.set('duration', String(params.duration));
    url.searchParams.set('traffic', String(params.traffic));

    if (params.city) url.searchParams.set('city', params.city);
    if (params.carrier) url.searchParams.set('carrier', params.carrier);

    const response = await fetch(url.toString());

    if (response.status !== 402) {
      const body = await response.text();
      throw new Error(
        `Expected 402 Payment Required, got ${response.status}: ${body}`
      );
    }

    return {
      requirement: readPaymentRequirement(await response.json()),
      url: url.toString(),
    };
  }

  /**
   * The payment option for the network the wallet is on. The agent wallet
   * pays on Base only, so an option for another chain is never taken.
   */
  private findPaymentOption(
    requirement: X402PaymentRequirement
  ): X402AcceptOption {
    const network = this.wallet.getNetwork();
    const option = requirement.accepts.find((a) => a.network === network);
    if (!option) {
      throw new Error(`The API offered no payment option on the ${network} network`);
    }
    return option;
  }

  /**
   * Pay one 402 option in USDC after checking the wallet can cover it.
   */
  private async pay(option: X402AcceptOption, amountMicroUSDC = option.maxAmountRequired): Promise<TransferResult> {
    if (!(await this.wallet.hasSufficientBalance(amountMicroUSDC))) {
      const balance = await this.wallet.getBalance();
      const required = Number(amountMicroUSDC) / 1e6;
      throw new Error(
        `Insufficient USDC balance. Required: $${required.toFixed(2)}, Available: ${balance.formatted}. ` +
        `Send USDC to the wallet ${this.wallet.address} and try again.`
      );
    }
    return this.wallet.sendUSDC(option.payTo, amountMicroUSDC);
  }

  /**
   * Send the request that claims what an on-chain payment bought. The API
   * reads the transaction hash from the Payment-Signature header. The USDC has
   * already left the wallet, so a failure names the transaction: without the
   * hash the payment could not be traced.
   */
  private async claimPayment<T>(what: string, url: string, transactionHash: string, init: RequestInit = {}): Promise<T> {
    const paid = `USDC was already sent in transaction ${transactionHash}. Do not pay again: give this hash to Proxies.sx support.`;

    let response: Response;
    try {
      response = await fetch(url, { ...init, headers: { ...init.headers, 'Payment-Signature': transactionHash } });
    } catch (error) {
      throw new Error(`${what} failed: ${error instanceof Error ? error.message : 'network error'}. ${paid}`);
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { message?: string };
      throw new Error(`${what} failed (${response.status}): ${error.message || 'Unknown error'}. ${paid}`);
    }

    return response.json() as Promise<T>;
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
      city: params.city,
      carrier: params.carrier,
    });

    // Step 2: Pay the option for our network
    const transfer = await this.pay(this.findPaymentOption(requirement));

    // Step 3: Submit payment proof and get proxy
    return this.claimPayment<X402ProxyResponse>('Payment verification', url, transfer.transactionHash);
  }

  /**
   * Get session status by ID
   */
  async getSessionStatus(sessionId: string): Promise<X402Session> {
    const url = `${this.v1Base()}/x402/sessions/${sessionId}/status`;

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
    return this.getPublic<X402PoolPricing>('/x402/pool/pricing');
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

    const url = new URL(`${this.v1Base()}/x402/pool`);
    // Without a tier the API uses its own default (see /x402/pool/pricing)
    if (params.tier) url.searchParams.set('tier', params.tier);
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

    // Step 2: Pay the option for our network
    const requirement = readPaymentRequirement(await initial.json());
    const transfer = await this.pay(this.findPaymentOption(requirement));

    // Step 3: Retry with Payment-Signature header
    return this.claimPayment<X402PoolResponse>('Pool access provisioning', url.toString(), transfer.transactionHash);
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

      const requirement = readPaymentRequirement(await quoteRes.json());
      const option = this.findPaymentOption(requirement);
      // amountUSDC in the 402 body is the session's own per-GB price; prefer it
      const amountMicro = requirement.amountUSDC !== undefined
        ? String(Math.ceil(Number(requirement.amountUSDC) * 1e6))
        : option.maxAmountRequired;

      const transfer = await this.pay(option, amountMicro);
      return this.claimPayment<X402PoolCredit>('Pool top-up', `${this.v1Base()}/x402/manage/pool/topup`, transfer.transactionHash, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    }

    // Duration only: free, no payment
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

  // ============ Public catalogue ============

  private async getPublic<T>(path: string): Promise<T> {
    const response = await fetch(`${this.v1Base()}${path}`);
    if (!response.ok) {
      throw new Error(`GET ${path} failed with HTTP ${response.status}`);
    }
    return response.json() as Promise<T>;
  }

  /**
   * Price per GB, traffic and duration limits, and payment networks for x402 proxies
   */
  async getProxyPricing(): Promise<X402ProxyPricing> {
    return this.getPublic<X402ProxyPricing>('/x402/pricing');
  }

  /**
   * Countries where an x402 proxy can be bought right now
   */
  async getCountries(): Promise<X402Country[]> {
    return this.getPublic<X402Country[]>('/x402/countries');
  }

  /**
   * x402 service health
   */
  async getHealth(): Promise<{ status: string; enabled: boolean }> {
    return this.getPublic<{ status: string; enabled: boolean }>('/x402/health');
  }
}

/**
 * Create an x402 client instance
 */
export function createX402Client(
  wallet: AgentWallet,
  baseUrl?: string
): X402Client {
  return new X402Client(wallet, baseUrl);
}
