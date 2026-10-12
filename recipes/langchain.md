# LangChain + Proxies.sx MCP

Give a LangChain agent the Proxies.sx tools through the MCP client.

## Setup

```bash
npm install @proxies-sx/mcp-server @modelcontextprotocol/sdk @langchain/core @langchain/anthropic
```

## Connect and call tools

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// PROXIES_API_URL is not needed
const transport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "@proxies-sx/mcp-server"],
  env: { PATH: process.env.PATH!, PROXIES_API_KEY: process.env.PROXIES_API_KEY! },
});

const client = new Client({ name: "langchain-agent", version: "1.0.0" });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(`Available tools: ${tools.length}`);

const text = async (name: string, args: Record<string, unknown> = {}) => {
  const result = await client.callTool({ name, arguments: args });
  const body = (result.content as Array<{ text: string }>)[0].text;
  if (result.isError) throw new Error(body); // the text says what to do
  return body;
};

// Pool Gateway: credentials, then a proxy URL for a residential peer in the US
const credentials = JSON.parse(await text("pool_get_my_credentials"));
const built = JSON.parse(await text("pool_build_proxy_url", {
  proxyUsername: credentials.proxyUsername,
  password: credentials.proxyPassword,
  pool: "peer",
  country: "us",
  ipType: "residential",
  rotation: "sticky",
  sid: "job1",
}));
console.log(built.username); // psx_...-peer-us-iptype-residential-sid-job1-rot-sticky
// built.proxyUrl contains the password: pass it to your HTTP client, do not log it
```

## As LangChain tools

Each MCP tool has a JSON Schema (`inputSchema`) and annotations (`readOnlyHint`, `destructiveHint`). Wrap the ones your agent needs:

```typescript
import { DynamicStructuredTool } from "@langchain/core/tools";

const wanted = ["pool_get_stock", "pool_get_facets", "pool_get_my_credentials", "pool_build_proxy_url", "pool_explain_error", "get_account_usage"];

const langchainTools = tools
  .filter((tool) => wanted.includes(tool.name))
  .map((tool) => new DynamicStructuredTool({
    name: tool.name,
    description: tool.description ?? "",
    schema: tool.inputSchema,
    func: (args) => text(tool.name, args as Record<string, unknown>),
  }));
```

## x402 mode (optional: pay in USDC, no account)

```typescript
const transport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "@proxies-sx/mcp-server"],
  env: { PATH: process.env.PATH!, AGENT_WALLET_KEY: process.env.WALLET_PRIVATE_KEY! }, // 0x key, wallet on Base
});

// Sends an on-chain USDC payment, then returns one credential for the whole tier
const access = await text("x402_get_pool_access", { tier: "peer", traffic_gb: 1 });
```

## Errors

A failing tool returns `isError: true` and a text that ends, for the common cases, with a `What to do:` line (missing key, missing scope, rate limit, server error). Surface that text to the model: it names the tool or page that fixes the problem.
