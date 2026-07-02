/**
 * x402 Types
 * TypeScript types for x402 protocol integration
 */

/**
 * Supported blockchain networks
 */
export type X402Network = 'base' | 'solana';

/**
 * Proxy tier levels
 */
export type X402Tier = 'shared' | 'private';

/**
 * x402 configuration
 */
export interface X402Config {
  /** Agent's wallet private key */
  walletPrivateKey: string;
  /** Preferred payment network */
  preferredNetwork: X402Network;
  /** Base RPC URL (optional) */
  baseRpcUrl?: string;
  /** Solana RPC URL (optional) */
  solanaRpcUrl?: string;
  /** API base URL */
  apiBaseUrl: string;
  /** Max daily spend in USDC (optional) */
  maxDailySpendUSDC?: number;
  /** Max per-transaction in USDC (optional) */
  maxTransactionUSDC?: number;
  /** Session cache path (optional) */
  sessionCachePath?: string;
}

/**
 * Wallet balance info
 */
export interface WalletBalance {
  /** Raw balance in micro USDC */
  usdc: string;
  /** Formatted display string */
  formatted: string;
  /** Network */
  network: X402Network;
}

/**
 * USDC transfer result
 */
export interface TransferResult {
  /** Transaction hash */
  transactionHash: string;
  /** Network used */
  network: X402Network;
  /** Amount in micro USDC */
  amount: string;
  /** Recipient address */
  recipient: string;
}

/**
 * x402 payment requirement from 402 response
 */
export interface X402PaymentRequirement {
  x402Version: number;
  accepts: X402AcceptOption[];
  outputSchema?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}

/**
 * Single payment option
 */
export interface X402AcceptOption {
  scheme: string;
  network: X402Network;
  chainId: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
}

/**
 * Proxy credentials
 */
export interface ProxyCredentials {
  host: string;
  httpPort: number;
  socksPort: number;
  username: string;
  password: string;
}

/**
 * Location info
 */
export interface LocationInfo {
  country: string;
  countryCode: string;
  city?: string;
  carrier?: string;
}

/**
 * Traffic info
 */
export interface TrafficInfo {
  allowedGB: number;
  usedBytes: number;
  usedGB: number;
  remainingBytes: number;
  remainingGB: number;
  percentUsed: number;
}

/**
 * x402 session from API
 */
export interface X402Session {
  id: string;
  status: 'active' | 'expired' | 'suspended';
  expiresAt: string;
  proxy: ProxyCredentials;
  location: LocationInfo;
  traffic: TrafficInfo;
  payment: {
    network: X402Network;
    transactionHash: string;
    amountUSDC: string;
    paidAt: string;
  };
  rotationUrl: string;
  rotationToken: string;
}

/**
 * x402 proxy purchase response
 */
export interface X402ProxyResponse {
  success: boolean;
  session: X402Session;
  payment: {
    network: X402Network;
    transactionHash: string;
    amountPaid: string;
    currency: string;
  };
}

/**
 * Cached session (local storage)
 */
export interface CachedSession {
  id: string;
  proxy: ProxyCredentials;
  expiresAt: string;
  location: LocationInfo;
  rotationUrl: string;
  rotationToken: string;
  /** Session token (x402s_...) used for X-Session-Token manage endpoints */
  sessionToken?: string;
}

/**
 * Session cache structure
 */
export interface SessionCacheData {
  walletAddress: string;
  sessions: CachedSession[];
  lastUpdated: string;
}

/**
 * Pricing info
 */
export interface X402Pricing {
  tier: X402Tier;
  trafficRatePerGB: number;
  totalCost: number;
  breakdown: {
    trafficCost: number;
    trafficGB: number;
  };
}

/**
 * Result of a session top-up / duration extension
 * (POST /v1/x402/manage/session/topup)
 */
export interface X402TopupResult {
  sessionId: string;
  trafficAllocatedGB: number;
  expiresAt: string;
  payment?: {
    txHash: string;
    network: string;
    amountUSDC: number;
  };
  ports?: Array<{ id: string; expiresAt: string }>;
}

/**
 * Pool Gateway proxy block returned after purchase
 * (GET|POST /v1/x402/pool -> { product, proxy, credit, sessionToken, ... })
 */
export interface X402PoolProxy {
  host: string;
  httpPort: number;
  username: string;
  password: string;
  http?: string;
  socks5?: string | null;
  usernameTemplate?: string;
  /** Backend returns an object: { tier, ipTypes, countries } */
  allowed?: unknown;
}

/**
 * Pool Gateway credit (pak-backed)
 */
export interface X402PoolCredit {
  tier?: string;
  allocatedGB: number;
  usedGB: number;
  remainingGB: number;
  enabled: boolean;
  expiresAt?: string;
  sessionToken?: string;
}

/**
 * Pool Gateway purchase response
 */
export interface X402PoolResponse {
  product: 'pool';
  proxy: X402PoolProxy;
  credit: X402PoolCredit;
  sessionToken: string;
  manage?: Record<string, string>;
  stockUrl?: string;
  quality?: unknown;
  caveats?: string[];
  payment?: {
    network: string;
    txHash?: string;
    amountUSDC?: string | number;
  };
}

/**
 * Pool Gateway tier catalog (no auth)
 * (GET /v1/x402/pool/pricing)
 */
export interface X402PoolPricing {
  product: 'pool';
  tiers: Array<{
    tier: string;
    pricePerGB: number;
    currency?: string;
    minPurchaseGB?: number;
    quality?: string;
    [key: string]: unknown;
  }>;
  defaultTier?: string;
  durationFree?: boolean;
  maxDurationSeconds?: number;
  stockUrl?: string;
  usernameDsl?: string;
  networks?: unknown[];
}
