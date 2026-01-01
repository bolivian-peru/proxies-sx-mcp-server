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
export type X402Tier = 'shared' | 'dedicated' | 'premium';

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
  hourlyRate: number;
  trafficRatePerGB: number;
  totalCost: number;
  breakdown: {
    timeCost: number;
    trafficCost: number;
    durationHours: number;
    trafficGB: number;
  };
}
