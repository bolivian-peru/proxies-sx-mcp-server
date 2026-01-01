/**
 * x402 Module
 * Exports for x402 protocol integration in MCP server
 */

// Types
export * from './types.js';

// Wallet
export { AgentWallet, createAgentWallet } from './wallet.js';

// Client
export { X402Client, createX402Client } from './client.js';

// Session cache
export { X402SessionCache, createSessionCache } from './session-cache.js';

// Tools
export { x402ToolDefinitions, x402Schemas, getX402ToolNames, isX402Tool } from './tools.js';

// Handlers
export { createX402ToolHandlers, type X402ToolHandlers } from './handlers.js';

// Re-export config type
export interface X402ModuleConfig {
  /** Agent's wallet private key (required) */
  walletPrivateKey: string;
  /** Preferred payment network */
  preferredNetwork?: 'base' | 'solana';
  /** API base URL */
  apiBaseUrl?: string;
  /** Base RPC URL */
  baseRpcUrl?: string;
  /** Session cache path */
  sessionCachePath?: string;
}

/**
 * Initialize the complete x402 module
 */
export function initializeX402Module(config: X402ModuleConfig) {
  const {
    walletPrivateKey,
    preferredNetwork = 'base',
    apiBaseUrl = 'https://api.proxies.sx/v1',
    baseRpcUrl = 'https://mainnet.base.org',
    sessionCachePath,
  } = config;

  // Create wallet
  const { createAgentWallet } = require('./wallet.js');
  const wallet = createAgentWallet(walletPrivateKey, baseRpcUrl);

  // Create session cache
  const { createSessionCache } = require('./session-cache.js');
  const cache = createSessionCache(wallet.address, sessionCachePath);

  // Create client
  const { createX402Client } = require('./client.js');
  const client = createX402Client(wallet, apiBaseUrl, preferredNetwork);

  // Create handlers
  const { createX402ToolHandlers } = require('./handlers.js');
  const handlers = createX402ToolHandlers(client, wallet, cache, apiBaseUrl);

  return {
    wallet,
    cache,
    client,
    handlers,
  };
}
