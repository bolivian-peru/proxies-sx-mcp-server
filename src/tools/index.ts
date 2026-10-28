/**
 * Tool Registry
 * Combines all MCP tools into a unified registry
 */

import type { ProxiesApi } from '../api/index.js';

// Import tool definitions
import { accountToolDefinitions, createAccountToolHandlers, accountSchemas } from './account.js';
import { portToolDefinitions, createPortToolHandlers, portSchemas } from './ports.js';
import { statusToolDefinitions, createStatusToolHandlers, statusSchemas } from './status.js';
import { rotationToolDefinitions, createRotationToolHandlers, rotationSchemas } from './rotation.js';
import { billingToolDefinitions, createBillingToolHandlers, billingSchemas } from './billing.js';
import { referenceToolDefinitions, createReferenceToolHandlers, referenceSchemas } from './reference.js';
import { utilityToolDefinitions, createUtilityToolHandlers, utilitySchemas } from './utilities.js';
import { paymentToolDefinitions, createPaymentToolHandlers, paymentSchemas } from './payments.js';
import { supportToolDefinitions, createSupportToolHandlers, supportSchemas } from './support.js';
import { x402SessionToolDefinitions, createX402SessionToolHandlers, x402SessionSchemas } from './x402-session.js';
import { opsToolDefinitions, createOpsToolHandlers, opsSchemas } from './ops.js';
import { poolToolDefinitions, poolKeyToolDefinitions, createPoolToolHandlers, poolSchemas } from './pool.js';
import { privatePoolToolDefinitions, createPrivatePoolToolHandlers, privatePoolSchemas } from './private-pool.js';
import { privateModemToolDefinitions, createPrivateModemToolHandlers, privateModemSchemas } from './private-modems.js';
import type { StructuredResult } from './structured.js';

// Export everything
export * from './account.js';
export * from './ports.js';
export * from './status.js';
export * from './rotation.js';
export * from './billing.js';
export * from './reference.js';
export * from './utilities.js';
export * from './payments.js';
export * from './support.js';
export * from './x402-session.js';
export * from './ops.js';
export * from './pool.js';
export * from './private-pool.js';
export * from './private-modems.js';
export * from './structured.js';

/**
 * Tools by category, in the order a client lists them. The catalogue
 * (tools.json, README) is generated from this, so it cannot drift.
 */
export const toolGroups = [
  { category: 'Pool Gateway', tools: poolToolDefinitions },
  { category: 'Private modems', tools: privateModemToolDefinitions },
  { category: 'Private Pool and Reserved IPs', tools: privatePoolToolDefinitions },
  { category: 'Account', tools: accountToolDefinitions },
  { category: 'Billing', tools: billingToolDefinitions },
  { category: 'Crypto payments', tools: paymentToolDefinitions },
  { category: 'Dedicated ports', tools: [...referenceToolDefinitions, ...portToolDefinitions] },
  { category: 'Port status', tools: statusToolDefinitions },
  { category: 'Port rotation', tools: rotationToolDefinitions },
  { category: 'Utilities', tools: utilityToolDefinitions },
  { category: 'Support', tools: supportToolDefinitions },
  { category: 'Pool access keys (reseller accounts)', tools: poolKeyToolDefinitions },
  { category: 'x402 session management', tools: x402SessionToolDefinitions },
  { category: 'Ops (admin keys only)', tools: opsToolDefinitions },
] as const;

/**
 * All tool definitions combined
 */
export const allToolDefinitions = toolGroups.flatMap(group => [...group.tools]);

/**
 * Tools that call only public routes (or none). They are registered in every
 * mode, so a wallet-only agent can also read stock and build proxy URLs.
 */
export const PUBLIC_TOOL_NAMES: readonly string[] = [
  'pool_get_stock',
  'pool_get_facets',
  'pool_build_proxy_url',
  'pool_explain_error',
  'get_service_status',
];

/**
 * The default toolset: about 20 tools that cover buying (modems, top-up,
 * price), using (pool credentials, stock, URL builder, modem credentials) and
 * managing (account, support) an account. Every other API-key tool is listed
 * with --toolset=full or PROXIES_TOOLSET=full. Wallet (x402) tools are not
 * affected: they are always listed when AGENT_WALLET_KEY is set.
 */
export const DEFAULT_TOOL_NAMES: readonly string[] = [
  // buy
  'proxies_modem_catalog',
  'proxies_modem_quote',
  'proxies_modem_buy',
  'proxies_modem_renew',
  'proxies_topup_checkout',
  'proxies_topup_status',
  'get_pricing',
  // use
  'pool_get_stock',
  'pool_get_my_credentials',
  'pool_build_proxy_url',
  'pool_explain_error',
  'proxies_modem_mine',
  'proxies_modem_rotate',
  // manage
  'get_account_summary',
  'get_account_usage',
  'pool_set_proxy_password',
  'get_service_status',
  'create_support_ticket',
  'list_my_tickets',
  'get_ticket',
];

/**
 * All validation schemas combined
 */
export const allSchemas = {
  ...accountSchemas,
  ...portSchemas,
  ...statusSchemas,
  ...rotationSchemas,
  ...billingSchemas,
  ...referenceSchemas,
  ...utilitySchemas,
  ...paymentSchemas,
  ...supportSchemas,
  ...x402SessionSchemas,
  ...opsSchemas,
  ...poolSchemas,
  ...privatePoolSchemas,
  ...privateModemSchemas,
} as const;

/**
 * Tool handler type. A tool with an outputSchema returns a StructuredResult
 * (structured content plus its text mirror); every other tool returns text.
 */
export type ToolHandler = (args: Record<string, unknown>) => Promise<string | StructuredResult>;

/**
 * Tool handlers map type
 */
export type ToolHandlers = Record<string, ToolHandler>;

/**
 * Create all tool handlers. Arguments reach a handler only after the tool's
 * zod schema accepted them (see server.ts), so the handler's own argument
 * type holds at run time.
 */
export function createAllToolHandlers(api: ProxiesApi, baseUrl: string): ToolHandlers {
  return {
    ...createAccountToolHandlers(api),
    ...createPortToolHandlers(api),
    ...createStatusToolHandlers(api),
    ...createRotationToolHandlers(api, baseUrl),
    ...createBillingToolHandlers(api),
    ...createReferenceToolHandlers(api),
    ...createUtilityToolHandlers(api, baseUrl),
    ...createPaymentToolHandlers(api),
    ...createSupportToolHandlers(api),
    ...createX402SessionToolHandlers(api),
    ...createOpsToolHandlers(api),
    ...createPoolToolHandlers(api),
    ...createPrivatePoolToolHandlers(api),
    ...createPrivateModemToolHandlers(api),
  } as unknown as ToolHandlers;
}
