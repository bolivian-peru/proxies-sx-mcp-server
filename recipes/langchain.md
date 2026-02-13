# LangChain + Proxies.sx MCP

Use mobile proxies in LangChain agents via MCP tool integration.

## Setup

```bash
npm install @proxies-sx/mcp-server @langchain/core @langchain/anthropic
```

## Agent with Proxy Tools

```typescript
import { ChatAnthropic } from "@langchain/anthropic";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Connect to MCP server
const transport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "@proxies-sx/mcp-server"],
  env: {
    PROXIES_API_KEY: "psx_your_key_here",
    PROXIES_API_URL: "https://api.proxies.sx/v1",
  },
});

const client = new Client({ name: "langchain-agent", version: "1.0.0" });
await client.connect(transport);

// List available tools
const { tools } = await client.listTools();
console.log(`Available tools: ${tools.length}`);

// Purchase a proxy
const result = await client.callTool({
  name: "create_port",
  arguments: { country: "US", trafficGB: 1, tier: "shared" },
});
console.log(result.content[0].text);

// Get connection string
const connStr = await client.callTool({
  name: "get_proxy_connection_string",
  arguments: { portId: "your-port-id", format: "http_url" },
});
console.log(connStr.content[0].text);

// Rotate IP
const rotation = await client.callTool({
  name: "rotate_port",
  arguments: { portId: "your-port-id" },
});
console.log(rotation.content[0].text);
```

## x402 Mode (No Account Needed)

```typescript
const transport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "@proxies-sx/mcp-server"],
  env: {
    AGENT_WALLET_KEY: "your_base_private_key",
    PROXIES_API_URL: "https://api.proxies.sx/v1",
  },
});

// Purchase with USDC automatically
const result = await client.callTool({
  name: "x402_get_proxy",
  arguments: { country: "US", traffic_gb: 1, tier: "shared" },
});
// Returns proxy credentials after on-chain payment
```

## Error Handling

All tools return structured JSON on error:

```json
{
  "error": true,
  "tool": "x402_get_proxy",
  "message": "Insufficient USDC balance",
  "retryable": false,
  "suggestion": "Top up your wallet with USDC on Base: 0x..."
}
```

Check `retryable` to decide whether to retry or surface the error.
