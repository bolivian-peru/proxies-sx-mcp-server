# Raw MCP Protocol + Proxies.sx

Direct MCP protocol usage without framework wrappers. Best for custom integrations.

## Setup

```bash
npm install @modelcontextprotocol/sdk @proxies-sx/mcp-server
```

## Full Example: Purchase, Use, Rotate, Clean Up

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {
  // 1. Connect to MCP server
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "@proxies-sx/mcp-server"],
    env: {
      PROXIES_API_KEY: process.env.PROXIES_API_KEY!,
      PROXIES_API_URL: "https://api.proxies.sx/v1",
    },
  });

  const client = new Client({ name: "my-agent", version: "1.0.0" });
  await client.connect(transport);

  // 2. Check account balance
  const account = await callTool(client, "get_account_summary");
  console.log("Account:", account);

  // 3. Check available countries
  const countries = await callTool(client, "list_available_countries", {});
  console.log("Countries:", countries);

  // 4. Create a proxy port
  const port = await callTool(client, "create_port", {
    country: "US",
    trafficGB: 1,
    tier: "shared",
  });
  console.log("Port created:", port);

  // Extract port ID from response (parse the text output)
  const portIdMatch = port.match(/Port ID: (\S+)/);
  const portId = portIdMatch?.[1];
  if (!portId) throw new Error("Failed to parse port ID");

  // 5. Get connection string
  const connStr = await callTool(client, "get_proxy_connection_string", {
    portId,
    format: "http_url",
  });
  console.log("Proxy URL:", connStr);

  // 6. Check proxy is online
  const status = await callTool(client, "get_port_status", { portId });
  console.log("Status:", status);

  // 7. Get current IP
  const ip = await callTool(client, "get_port_ip", { portId });
  console.log("Current IP:", ip);

  // 8. Use the proxy (example with fetch)
  const proxyUrl = connStr.trim();
  console.log(`Use this proxy URL in your HTTP client: ${proxyUrl}`);

  // 9. Rotate IP
  const rotation = await callTool(client, "rotate_port", { portId });
  console.log("Rotated:", rotation);

  // 10. Verify new IP
  const newIp = await callTool(client, "get_port_ip", { portId });
  console.log("New IP:", newIp);

  // 11. Clean up
  const deleted = await callTool(client, "delete_port", { portId });
  console.log("Deleted:", deleted);

  await client.close();
}

async function callTool(
  client: Client,
  name: string,
  args?: Record<string, unknown>
): Promise<string> {
  const result = await client.callTool({ name, arguments: args || {} });
  const text = result.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n");

  // Check for structured errors
  try {
    const parsed = JSON.parse(text);
    if (parsed.error) {
      console.error(`Tool error [${parsed.tool}]: ${parsed.message}`);
      if (parsed.retryable) {
        console.log(`Suggestion: ${parsed.suggestion}`);
      }
      throw new Error(parsed.message);
    }
  } catch {
    // Not JSON = success response (text output)
  }

  return text;
}

main().catch(console.error);
```

## x402 Mode (Autonomous USDC Payments)

```typescript
const transport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "@proxies-sx/mcp-server"],
  env: {
    AGENT_WALLET_KEY: process.env.WALLET_PRIVATE_KEY!,
    PROXIES_API_URL: "https://api.proxies.sx/v1",
    PREFERRED_NETWORK: "solana", // or "base"
  },
});

// Tools available in x402 mode:
// x402_get_proxy      - Purchase proxy with USDC
// x402_get_pricing    - Check pricing
// x402_wallet_balance - Check wallet
// x402_list_sessions  - List active proxies
// x402_check_session  - Session details
// x402_rotate_ip      - Rotate IP
// x402_list_countries  - Available countries

const proxy = await callTool(client, "x402_get_proxy", {
  country: "US",
  traffic_gb: 1,
  tier: "shared",
});
// Automatically sends $4 USDC and returns proxy credentials
```

## Error Response Format

All errors return structured JSON:

```json
{
  "error": true,
  "tool": "x402_get_proxy",
  "message": "Insufficient USDC balance",
  "retryable": false,
  "suggestion": "Top up your wallet with USDC on Base: 0x..."
}
```

| Field | Type | Description |
|-------|------|-------------|
| `error` | boolean | Always `true` for errors |
| `tool` | string | Tool name that failed |
| `message` | string | Human-readable error |
| `retryable` | boolean | Whether retry might succeed |
| `suggestion` | string | What to do next |
