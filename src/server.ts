/**
 * Proxies.sx MCP Server
 * Model Context Protocol server for AI agent proxy management
 *
 * Supports two authentication modes:
 * 1. API Key Mode: Traditional API key authentication (PROXIES_API_KEY)
 * 2. x402 Mode: Wallet-based payment authentication (AGENT_WALLET_KEY)
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
import { allToolDefinitions, allSchemas, createAllToolHandlers } from './tools/index.js';

// x402 imports
import {
  createAgentWallet,
  createX402Client,
  createSessionCache,
  createX402ToolHandlers,
  x402ToolDefinitions,
  x402Schemas,
} from './x402/index.js';

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

  // x402 wallet authentication (Mode 2)
  walletPrivateKey?: string;
  preferredNetwork?: 'base' | 'solana';
  baseRpcUrl?: string;
}

/**
 * Default API base URL
 */
const DEFAULT_BASE_URL = 'https://api.proxies.sx';

/**
 * Determine which mode to use based on config
 */
function getAuthMode(config: McpServerConfig): 'apiKey' | 'x402' | 'hybrid' {
  const hasApiKey = !!(config.apiKey || (config.email && config.password));
  const hasWallet = !!config.walletPrivateKey;

  if (hasApiKey && hasWallet) return 'hybrid';
  if (hasWallet) return 'x402';
  if (hasApiKey) return 'apiKey';

  throw new Error(
    'Authentication required. Set one of:\n' +
    '  - PROXIES_API_KEY: API key from https://client.proxies.sx/account\n' +
    '  - AGENT_WALLET_KEY: Your wallet private key for x402 payments'
  );
}

/**
 * Create and configure the MCP server
 */
export async function createMcpServer(config: McpServerConfig) {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  const authMode = getAuthMode(config);

  let api: ReturnType<typeof createProxiesApi> | null = null;
  let toolHandlers: Record<string, (args: Record<string, unknown>) => Promise<string>> = {};
  let combinedToolDefinitions: Array<{ name: string; description: string; inputSchema: object }> = [];
  let combinedSchemas: Record<string, { safeParse: (data: unknown) => { success: boolean; data?: unknown; error?: { message: string } } }> = {};

  // Initialize API key mode if available
  if (authMode === 'apiKey' || authMode === 'hybrid') {
    try {
      const auth = await getAuthToken({
        baseUrl,
        apiKey: config.apiKey,
        email: config.email,
        password: config.password,
      });

      api = createProxiesApi({
        baseUrl: baseUrl,
        token: auth.token,
        authType: auth.type,
      });

      const apiHandlers = createAllToolHandlers(api, baseUrl);
      toolHandlers = { ...toolHandlers, ...apiHandlers };
      combinedToolDefinitions = [...allToolDefinitions];
      combinedSchemas = { ...allSchemas };
    } catch (error) {
      // If hybrid mode and API key fails, continue with x402 only
      if (authMode !== 'hybrid') {
        throw error;
      }
      console.error('API key auth failed, using x402 mode only:', error);
    }
  }

  // Initialize x402 mode if wallet is available
  if (authMode === 'x402' || authMode === 'hybrid') {
    const wallet = createAgentWallet(
      config.walletPrivateKey!,
      config.baseRpcUrl
    );

    const cache = createSessionCache(wallet.address);

    const client = createX402Client(
      wallet,
      baseUrl,
      config.preferredNetwork || 'base'
    );

    const x402Handlers = createX402ToolHandlers(client, wallet, cache, baseUrl);

    // Add x402 handlers
    toolHandlers = {
      ...toolHandlers,
      x402_get_proxy: (args) => x402Handlers.x402_get_proxy(args as Parameters<typeof x402Handlers.x402_get_proxy>[0]),
      x402_get_pricing: (args) => x402Handlers.x402_get_pricing(args as Parameters<typeof x402Handlers.x402_get_pricing>[0]),
      x402_list_sessions: () => x402Handlers.x402_list_sessions(),
      x402_check_session: (args) => x402Handlers.x402_check_session(args as Parameters<typeof x402Handlers.x402_check_session>[0]),
      x402_wallet_balance: () => x402Handlers.x402_wallet_balance(),
      x402_rotate_ip: (args) => x402Handlers.x402_rotate_ip(args as Parameters<typeof x402Handlers.x402_rotate_ip>[0]),
      x402_list_countries: () => x402Handlers.x402_list_countries(),
      x402_list_cities: (args) => x402Handlers.x402_list_cities(args as Parameters<typeof x402Handlers.x402_list_cities>[0]),
      x402_list_carriers: (args) => x402Handlers.x402_list_carriers(args as Parameters<typeof x402Handlers.x402_list_carriers>[0]),
      x402_extend_session: (args) => x402Handlers.x402_extend_session(args as Parameters<typeof x402Handlers.x402_extend_session>[0]),
      x402_service_status: () => x402Handlers.x402_service_status(),
    };

    // Add x402 tool definitions
    combinedToolDefinitions = [...combinedToolDefinitions, ...x402ToolDefinitions];
    combinedSchemas = { ...combinedSchemas, ...x402Schemas };

    // Log x402 mode info
    console.error(`x402 mode enabled. Wallet: ${wallet.address}`);
  }

  // Create MCP server
  const server = new Server(
    {
      name: 'proxies-sx-mcp',
      version: '2.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tools/list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: combinedToolDefinitions.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };
  });

  // Register tools/call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Get tool handler
    const handler = toolHandlers[name];
    if (!handler) {
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${name}`
      );
    }

    // Get validation schema
    const schema = combinedSchemas[name as keyof typeof combinedSchemas];
    if (!schema) {
      throw new McpError(
        ErrorCode.InternalError,
        `No schema found for tool: ${name}`
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
      // Execute tool
      const result = await handler(parseResult.data as Record<string, unknown>);

      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    } catch (error) {
      // Handle API errors
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });

  return { server, api, toolHandlers };
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
  const preferredNetwork = process.env.PREFERRED_NETWORK as 'base' | 'solana' | undefined;
  const baseRpcUrl = process.env.BASE_RPC_URL;

  // Validate that we have at least one form of authentication
  const hasApiKey = !!(apiKey || (email && password));
  const hasWallet = !!walletPrivateKey;

  if (!hasApiKey && !hasWallet) {
    throw new Error(
      'Authentication required. Set one of:\n' +
      '  Mode 1 (API Key):\n' +
      '    - PROXIES_API_KEY: Your API key from https://client.proxies.sx/account\n' +
      '    - Or PROXIES_EMAIL and PROXIES_PASSWORD: Your login credentials\n' +
      '  Mode 2 (x402 Wallet - No API key needed):\n' +
      '    - AGENT_WALLET_KEY: Your wallet private key for USDC payments\n' +
      '    - Optional: PREFERRED_NETWORK=base or solana (default: base)'
    );
  }

  return {
    apiKey,
    email,
    password,
    baseUrl,
    walletPrivateKey,
    preferredNetwork,
    baseRpcUrl,
  };
}
