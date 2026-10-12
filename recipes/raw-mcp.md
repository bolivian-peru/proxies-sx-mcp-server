# Raw MCP client + Proxies.sx

Direct MCP protocol usage without a framework. The same calls work from any MCP client library.

## Setup

```bash
npm install @modelcontextprotocol/sdk @proxies-sx/mcp-server
```

## Get a Pool Gateway proxy URL and use it

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function callTool(client: Client, name: string, args: Record<string, unknown> = {}): Promise<string> {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as Array<{ text: string }>)[0].text;
  // A failed tool answers isError: true with a text that says what to do
  if (result.isError) throw new Error(text);
  return text;
}

async function main() {
  // 1. Start the server. PROXIES_API_URL is not needed.
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "@proxies-sx/mcp-server"],
    env: { PATH: process.env.PATH!, PROXIES_API_KEY: process.env.PROXIES_API_KEY! },
  });
  const client = new Client({ name: "my-agent", version: "1.0.0" });
  await client.connect(transport);

  // 2. Is there traffic left, and stock where we want it?
  console.log(await callTool(client, "get_account_usage"));
  const stock = JSON.parse(await callTool(client, "pool_get_stock", { country: "de" }));
  console.log(`DE: ${stock.peer} peer endpoints, ${stock.mbl} carrier modems`);

  // 3. Credentials (contains a secret: do not log it)
  const credentials = JSON.parse(await callTool(client, "pool_get_my_credentials"));

  // 4. Build the proxy URL: residential peer in Germany, one device held for this job
  const built = JSON.parse(await callTool(client, "pool_build_proxy_url", {
    proxyUsername: credentials.proxyUsername,
    password: credentials.proxyPassword,
    pool: "peer",
    country: "de",
    ipType: "residential",
    rotation: "sticky",
    sid: "job1",
  }));
  for (const warning of built.warnings) console.warn(warning);

  // 5. Use built.proxyUrl in your HTTP client (undici ProxyAgent, axios, curl -x ...)
  //    If the gateway refuses a request, ask what the code means:
  console.log(await callTool(client, "pool_explain_error", { error: "E_NO_STOCK_COUNTRY" }));

  await client.close();
}

main().catch(console.error);
```

Rules worth knowing (the builder enforces or warns about them):

- `mbl` (carrier modems) exists only in US, GB, FR, NL, PL and GE (Georgia). For any other country use `peer`.
- `sticky`, `hard` and `auto*` rotation persist across connections only with a `sid`.
- Sticky holds the device, not the IP.

## A dedicated port on a carrier modem

```typescript
// countryId comes from list_available_countries (an id, not a country code)
const countries = await callTool(client, "list_available_countries");
const countryId = countries.match(/United States \(US\).*countryId: (\S+)/)?.[1];

const port = await callTool(client, "create_port", { countryId, expiresInDays: 1 });
const portId = port.match(/^ID: (\S+)/m)?.[1];

console.log(await callTool(client, "get_proxy_connection_string", { portId, protocol: "http" }));
console.log(await callTool(client, "rotate_port", { portId }));   // another modem; port numbers change
await callTool(client, "configure_auto_rotation", { portId, enabled: true, intervalMinutes: 30 });
await callTool(client, "delete_port", { portId });
```

## x402 mode (optional: pay in USDC, no account)

```typescript
const transport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "@proxies-sx/mcp-server"],
  env: { PATH: process.env.PATH!, AGENT_WALLET_KEY: process.env.WALLET_PRIVATE_KEY! }, // 0x key, wallet on Base
});

console.log(await callTool(client, "x402_pool_pricing"));      // live tiers and prices
console.log(await callTool(client, "x402_wallet_balance"));    // USDC and gas on Base

// Sends an on-chain USDC payment, then returns one credential for the whole tier
console.log(await callTool(client, "x402_get_pool_access", { tier: "peer", traffic_gb: 1 }));
```

## Errors

A failing tool returns a normal MCP result with `isError: true` and a text such as:

```
Error: API key missing required scope: ports:write
What to do: Create a key that includes the ports:write scope at https://client.proxies.sx/account.
```

Wrong argument types or a missing required argument are rejected before the call, as an MCP `InvalidParams` protocol error.
