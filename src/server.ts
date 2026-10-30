/**
 * Proxies.sx MCP Server
 * Model Context Protocol server for AI agent proxy management
 *
 * Modes:
 * 1. API key (PROXIES_API_KEY): the standard path, an account with deposited GB
 * 2. x402 wallet (AGENT_WALLET_KEY): optional, pay per GB in USDC without an account
 * 3. Both set: every tool of both modes
 * 4. Neither: only the public tools (stock, facets, proxy URL builder, error help, status)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { createProxiesApi, getAuthToken } from './api/index.js';
import { allToolDefinitions, allSchemas, createAllToolHandlers, DEFAULT_TOOL_NAMES, PUBLIC_TOOL_NAMES, type ToolHandlers } from './tools/index.js';
import type { ToolAnnotations } from './tools/annotations.js';
import { explainError } from './utils/errors.js';

// x402 imports
import {
  createAgentWallet,
  createX402Client,
  createSessionCache,
  createX402ToolHandlers,
  x402ToolDefinitions,
  x402Schemas,
} from './x402/index.js';

// Compiled to CommonJS: dist/server.js sits one level below package.json.
const { version: PACKAGE_VERSION } = require('../package.json') as { version: string };

/**
 * MCP Server configuration
 */
export interface McpServerConfig {
  // API key authentication (Mode 1)
  apiKey?: string;
  // Email/password authentication (Mode 1)
  email?: string;
  password?: string;
  // Base URL (optional)
  baseUrl?: string;

  // x402 wallet authentication (Mode 2): a wallet on the Base network
  walletPrivateKey?: string;
  baseRpcUrl?: string;

  /** Which API-key tools to list: the default ~20 (DEFAULT_TOOL_NAMES) or all of them */
  toolset?: Toolset;

  /** Hosted mode: the caller's IP, forwarded to the API for per-caller rate limits */
  forwardedFor?: string;
}

export type Toolset = 'default' | 'full';
const TOOLSETS: readonly Toolset[] = ['default', 'full'];

interface RegisteredTool {
  name: string;
  description: string;
  inputSchema: object;
  outputSchema?: object;
  annotations: ToolAnnotations;
}

type ArgumentSchema = { safeParse: (data: unknown) => { success: boolean; data?: unknown; error?: { message: string } } };

/** Told to the agent at initialize: the shortest path from question to working proxy */
const ACCOUNT_INSTRUCTIONS =
  'Proxies.sx: residential and mobile proxies, metered per GB. To get a working proxy: pool_get_stock (pick a country with stock), ' +
  'get_account_summary (GB left), proxies_topup_checkout when none is left (returns a payment link for the user), pool_get_my_credentials, ' +
  'then pool_build_proxy_url and send traffic through gw.proxies.sx:7000 (HTTP) or :7001 (SOCKS5). For a dedicated whole 4G/5G modem: ' +
  'proxies_modem_catalog, proxies_modem_quote, proxies_modem_buy (pass your own idempotencyKey to buy and renew, and reuse it on a retry, ' +
  'so a lost response never buys twice). On any proxy error code, call pool_explain_error.';
const PUBLIC_INSTRUCTIONS =
  'Proxies.sx: residential and mobile proxies, metered per GB. Connected without an API key, so only the public tools are listed ' +
  '(stock per country, proxy URL format, error help, service status). To buy and use proxies, the user creates an account and an API key at ' +
  'https://client.proxies.sx/account, then reconnects with the header "Authorization: Bearer <key>" (hosted, https://api.proxies.sx/mcp) ' +
  'or PROXIES_API_KEY (local npx). Prices: https://api.proxies.sx/v1/pricing';

/**
 * Default API base URL
 */
const DEFAULT_BASE_URL = 'https://api.proxies.sx';

/**
 * Every tool adds the `/v1` prefix itself, so the base must not carry it.
 * Both spellings of PROXIES_API_URL are accepted: with and without `/v1`.
 */
export function normalizeBaseUrl(baseUrl?: string): string {
  return (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '').replace(/\/v1$/, '');
}

/**
 * Names of the API-key tools listed for this account and toolset
 */
function listedNames(hasAccount: boolean, toolset: Toolset = 'default'): readonly string[] {
  if (!hasAccount) return PUBLIC_TOOL_NAMES;
  if (toolset === 'full') return allToolDefinitions.map(tool => tool.name);
  return DEFAULT_TOOL_NAMES;
}

/**
 * Toolset from `--toolset=<name>` on the command line, else PROXIES_TOOLSET
 */
export function toolsetFrom(argv: readonly string[], env: NodeJS.ProcessEnv): Toolset {
  const flag = argv.find(arg => arg.startsWith('--toolset='))?.slice('--toolset='.length);
  const name = flag ?? env.PROXIES_TOOLSET ?? 'default';
  if (!TOOLSETS.includes(name as Toolset)) {
    throw new Error(`Unknown toolset "${name}". Use --toolset=default (about 20 tools) or --toolset=full (every tool); PROXIES_TOOLSET takes the same values.`);
  }
  return name as Toolset;
}

/**
 * Determine which mode to use based on config
 */
function getAuthMode(config: McpServerConfig): 'apiKey' | 'x402' | 'hybrid' | 'public' {
  const hasApiKey = !!(config.apiKey || (config.email && config.password));
  const hasWallet = !!config.walletPrivateKey;

  if (hasApiKey && hasWallet) return 'hybrid';
  if (hasWallet) return 'x402';
  if (hasApiKey) return 'apiKey';
  return 'public';
}

/**
 * Create and configure the MCP server
 */
export async function createMcpServer(config: McpServerConfig) {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const authMode = getAuthMode(config);

  // Account credential for the API-key tools; absent in wallet-only mode
  let auth: Awaited<ReturnType<typeof getAuthToken>> | undefined;
  if (authMode === 'apiKey' || authMode === 'hybrid') {
    try {
      auth = await getAuthToken({
        baseUrl,
        apiKey: config.apiKey,
        email: config.email,
        password: config.password,
      });
    } catch (error) {
      // If hybrid mode and the login fails, continue with x402 only
      if (authMode !== 'hybrid') {
        throw error;
      }
      console.error('Account login failed, using x402 mode only:', explainError(error instanceof Error ? error.message : String(error)));
    }
  }

  // Without an account only the tools that call public routes are registered;
  // with one, the default toolset unless the full one was asked for
  const api = createProxiesApi({ baseUrl, token: auth?.token, authType: auth?.type, forwardedFor: config.forwardedFor });
  const apiTools: RegisteredTool[] = allToolDefinitions.filter(tool => listedNames(!!auth, config.toolset).includes(tool.name));

  let toolHandlers: ToolHandlers = createAllToolHandlers(api, baseUrl);
  let combinedToolDefinitions: RegisteredTool[] = apiTools;
  let combinedSchemas: Record<string, ArgumentSchema> = { ...allSchemas };

  // Initialize x402 mode if wallet is available
  if (config.walletPrivateKey) {
    const wallet = createAgentWallet(config.walletPrivateKey, config.baseRpcUrl);
    const cache = createSessionCache(wallet.address);
    const client = createX402Client(wallet, baseUrl);

    toolHandlers = { ...toolHandlers, ...(createX402ToolHandlers(client, wallet, cache) as unknown as ToolHandlers) };
    combinedToolDefinitions = [...combinedToolDefinitions, ...x402ToolDefinitions];
    combinedSchemas = { ...combinedSchemas, ...x402Schemas };

    // Log x402 mode info
    console.error(`x402 mode enabled. Wallet: ${wallet.address}`);
  }

  const registeredNames = new Set(combinedToolDefinitions.map(tool => tool.name));

  // The exact credentials this process was started with, masked in every tool error
  const startupSecrets = [config.apiKey, config.password, config.walletPrivateKey?.replace(/^0x/, '')]
    .filter((secret): secret is string => !!secret);

  // Create MCP server
  const server = new Server(
    {
      name: 'proxies-sx-mcp',
      version: PACKAGE_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
      instructions: auth ? ACCOUNT_INSTRUCTIONS : PUBLIC_INSTRUCTIONS,
    }
  );

  // Register tools/list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: combinedToolDefinitions.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        annotations: tool.annotations,
      })),
    };
  });

  // Register tools/call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Only tools listed in this mode can be called
    const handler = registeredNames.has(name) ? toolHandlers[name] : undefined;
    const schema = combinedSchemas[name];
    if (!handler || !schema) {
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${name}`
      );
    }

    // Validate arguments
    const parseResult = schema.safeParse(args || {});
    if (!parseResult.success) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid arguments for ${name}: ${parseResult.error?.message || 'Validation failed'}`
      );
    }

    try {
      // Execute tool; a structured result is mirrored as text
      const result = await handler(parseResult.data as Record<string, unknown>);
      if (typeof result === 'string') {
        return { content: [{ type: 'text', text: result }] };
      }
      return {
        content: [{ type: 'text', text: result.text }],
        structuredContent: result.structuredContent,
      };
    } catch (error) {
      // The single tool-error path: say what to do, never leak a credential
      const rawMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorMessage = startupSecrets.reduce((text, secret) => text.split(secret).join('[redacted]'), rawMessage);

      return {
        content: [
          {
            type: 'text',
            text: `Error: ${explainError(errorMessage)}`,
          },
        ],
        isError: true,
      };
    }
  });

  return { server, api, toolHandlers, toolDefinitions: combinedToolDefinitions };
}

/**
 * Start the MCP server with stdio transport
 */
export async function startMcpServer(config: McpServerConfig): Promise<void> {
  const { server } = await createMcpServer(config);

  // Create stdio transport
  const transport = new StdioServerTransport();

  // Connect server to transport
  await server.connect(transport);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.close();
    process.exit(0);
  });
}

/**
 * Get configuration from environment variables
 */
export function getConfigFromEnv(): McpServerConfig {
  // API key auth
  const apiKey = process.env.PROXIES_API_KEY;
  const email = process.env.PROXIES_EMAIL;
  const password = process.env.PROXIES_PASSWORD;
  const baseUrl = process.env.PROXIES_API_URL;

  // x402 wallet auth
  const walletPrivateKey = process.env.AGENT_WALLET_KEY;
  const baseRpcUrl = process.env.BASE_RPC_URL;

  // Without any credential the server still starts, with the public tools only
  if (!apiKey && !(email && password) && !walletPrivateKey) {
    console.error('No PROXIES_API_KEY or AGENT_WALLET_KEY set: only the public tools are listed. Create a key at https://client.proxies.sx/account');
  }

  return {
    apiKey,
    email,
    password,
    baseUrl,
    walletPrivateKey,
    baseRpcUrl,
    toolset: toolsetFrom(process.argv.slice(2), process.env),
  };
}
