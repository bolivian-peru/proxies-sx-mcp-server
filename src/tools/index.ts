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

/**
 * All tool definitions combined
 */
export const allToolDefinitions = [
  ...accountToolDefinitions,
  ...portToolDefinitions,
  ...statusToolDefinitions,
  ...rotationToolDefinitions,
  ...billingToolDefinitions,
  ...referenceToolDefinitions,
  ...utilityToolDefinitions,
  ...paymentToolDefinitions,
  ...supportToolDefinitions,
  ...x402SessionToolDefinitions,
] as const;

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
} as const;

/**
 * Tool handler type
 */
export type ToolHandler = (args: Record<string, unknown>) => Promise<string>;

/**
 * Tool handlers map type
 */
export type ToolHandlers = Record<string, ToolHandler>;

/**
 * Create all tool handlers
 */
export function createAllToolHandlers(api: ProxiesApi, baseUrl: string): ToolHandlers {
  const accountHandlers = createAccountToolHandlers(api);
  const portHandlers = createPortToolHandlers(api);
  const statusHandlers = createStatusToolHandlers(api);
  const rotationHandlers = createRotationToolHandlers(api, baseUrl);
  const billingHandlers = createBillingToolHandlers(api);
  const referenceHandlers = createReferenceToolHandlers(api);
  const utilityHandlers = createUtilityToolHandlers(api, baseUrl);
  const paymentHandlers = createPaymentToolHandlers(api);
  const supportHandlers = createSupportToolHandlers(api);
  const x402SessionHandlers = createX402SessionToolHandlers(api, baseUrl);

  return {
    // Account tools
    get_account_summary: () => accountHandlers.get_account_summary(),
    get_account_usage: () => accountHandlers.get_account_usage(),

    // Port tools
    list_ports: (args) => portHandlers.list_ports(args as Parameters<typeof portHandlers.list_ports>[0]),
    get_port: (args) => portHandlers.get_port(args as Parameters<typeof portHandlers.get_port>[0]),
    create_port: (args) => portHandlers.create_port(args as Parameters<typeof portHandlers.create_port>[0]),
    delete_port: (args) => portHandlers.delete_port(args as Parameters<typeof portHandlers.delete_port>[0]),
    update_port_credentials: (args) => portHandlers.update_port_credentials(args as Parameters<typeof portHandlers.update_port_credentials>[0]),
    update_os_fingerprint: (args) => portHandlers.update_os_fingerprint(args as Parameters<typeof portHandlers.update_os_fingerprint>[0]),
    reconfigure_port: (args) => portHandlers.reconfigure_port(args as Parameters<typeof portHandlers.reconfigure_port>[0]),

    // Status tools
    get_port_status: (args) => statusHandlers.get_port_status(args as Parameters<typeof statusHandlers.get_port_status>[0]),
    get_port_ip: (args) => statusHandlers.get_port_ip(args as Parameters<typeof statusHandlers.get_port_ip>[0]),
    ping_port: (args) => statusHandlers.ping_port(args as Parameters<typeof statusHandlers.ping_port>[0]),
    speed_test_port: (args) => statusHandlers.speed_test_port(args as Parameters<typeof statusHandlers.speed_test_port>[0]),

    // Rotation tools
    rotate_port: (args) => rotationHandlers.rotate_port(args as Parameters<typeof rotationHandlers.rotate_port>[0]),
    check_rotation_availability: (args) => rotationHandlers.check_rotation_availability(args as Parameters<typeof rotationHandlers.check_rotation_availability>[0]),
    configure_auto_rotation: (args) => rotationHandlers.configure_auto_rotation(args as Parameters<typeof rotationHandlers.configure_auto_rotation>[0]),
    get_rotation_history: (args) => rotationHandlers.get_rotation_history(args as Parameters<typeof rotationHandlers.get_rotation_history>[0]),
    get_rotation_token_url: (args) => rotationHandlers.get_rotation_token_url(args as Parameters<typeof rotationHandlers.get_rotation_token_url>[0]),

    // Billing tools (NEW MODEL - FREE slots)
    get_pricing: () => billingHandlers.get_pricing(),
    calculate_price: (args) => billingHandlers.calculate_price(args as Parameters<typeof billingHandlers.calculate_price>[0]),
    purchase_shared_traffic: (args) => billingHandlers.purchase_shared_traffic(args as Parameters<typeof billingHandlers.purchase_shared_traffic>[0]),
    purchase_private_traffic: (args) => billingHandlers.purchase_private_traffic(args as Parameters<typeof billingHandlers.purchase_private_traffic>[0]),

    // Reference tools
    list_available_countries: (args) => referenceHandlers.list_available_countries(args as Parameters<typeof referenceHandlers.list_available_countries>[0]),
    list_carriers_for_country: (args) => referenceHandlers.list_carriers_for_country(args as Parameters<typeof referenceHandlers.list_carriers_for_country>[0]),
    list_cities_for_country: (args) => referenceHandlers.list_cities_for_country(args as Parameters<typeof referenceHandlers.list_cities_for_country>[0]),
    list_regions_for_country: (args) => referenceHandlers.list_regions_for_country(args as Parameters<typeof referenceHandlers.list_regions_for_country>[0]),

    // Utility tools
    get_proxy_connection_string: (args) => utilityHandlers.get_proxy_connection_string(args as Parameters<typeof utilityHandlers.get_proxy_connection_string>[0]),
    get_all_proxy_formats: (args) => utilityHandlers.get_all_proxy_formats(args as Parameters<typeof utilityHandlers.get_all_proxy_formats>[0]),
    get_os_fingerprint_options: () => utilityHandlers.get_os_fingerprint_options(),

    // Payment tools (CoinGate crypto)
    create_crypto_payment: (args) => paymentHandlers.create_crypto_payment(args as Parameters<typeof paymentHandlers.create_crypto_payment>[0]),
    check_crypto_payment_status: (args) => paymentHandlers.check_crypto_payment_status(args as Parameters<typeof paymentHandlers.check_crypto_payment_status>[0]),
    get_pending_crypto_payments: () => paymentHandlers.get_pending_crypto_payments(),
    cancel_crypto_payment: (args) => paymentHandlers.cancel_crypto_payment(args as Parameters<typeof paymentHandlers.cancel_crypto_payment>[0]),
    get_crypto_payment_info: () => paymentHandlers.get_crypto_payment_info(),

    // Support tools (tickets)
    create_support_ticket: (args) => supportHandlers.create_support_ticket(args as Parameters<typeof supportHandlers.create_support_ticket>[0]),
    list_my_tickets: () => supportHandlers.list_my_tickets(),
    get_ticket: (args) => supportHandlers.get_ticket(args as Parameters<typeof supportHandlers.get_ticket>[0]),
    reply_to_ticket: (args) => supportHandlers.reply_to_ticket(args as Parameters<typeof supportHandlers.reply_to_ticket>[0]),
    close_ticket: (args) => supportHandlers.close_ticket(args as Parameters<typeof supportHandlers.close_ticket>[0]),

    // X402 Session Management tools
    get_x402_session: (args) => x402SessionHandlers.get_x402_session(args as Parameters<typeof x402SessionHandlers.get_x402_session>[0]),
    list_x402_ports: (args) => x402SessionHandlers.list_x402_ports(args as Parameters<typeof x402SessionHandlers.list_x402_ports>[0]),
    get_x402_port_status: (args) => x402SessionHandlers.get_x402_port_status(args as Parameters<typeof x402SessionHandlers.get_x402_port_status>[0]),
    get_sessions_by_wallet: (args) => x402SessionHandlers.get_sessions_by_wallet(args as Parameters<typeof x402SessionHandlers.get_sessions_by_wallet>[0]),
    get_session_status: (args) => x402SessionHandlers.get_session_status(args as Parameters<typeof x402SessionHandlers.get_session_status>[0]),
  };
}

/**
 * Get tool names list
 */
export function getToolNames(): string[] {
  return allToolDefinitions.map(t => t.name);
}

/**
 * Get tool definition by name
 */
export function getToolDefinition(name: string) {
  return allToolDefinitions.find(t => t.name === name);
}
