#!/usr/bin/env node

/**
 * Proxies.sx MCP Server - Entry Point
 *
 * MCP (Model Context Protocol) server for AI agents to use Proxies.sx
 * residential and mobile proxies: Pool Gateway, dedicated ports, billing, support
 *
 * Usage:
 *   PROXIES_API_KEY=psx_xxx npx -y @proxies-sx/mcp-server
 *
 * Or add to Claude Desktop config:
 *   {
 *     "mcpServers": {
 *       "proxies-sx": {
 *         "command": "npx",
 *         "args": ["-y", "@proxies-sx/mcp-server"],
 *         "env": {
 *           "PROXIES_API_KEY": "psx_your_key_here"
 *         }
 *       }
 *     }
 *   }
 */

import { startMcpServer, getConfigFromEnv } from './server.js';

// Re-export everything for programmatic usage
export * from './api/index.js';
export * from './tools/index.js';
export * from './utils/index.js';
export * from './server.js';

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    // Get configuration from environment
    const config = getConfigFromEnv();

    // Start the MCP server
    await startMcpServer(config);
  } catch (error) {
    console.error('Failed to start MCP server:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run main if this is the entry point
main();
