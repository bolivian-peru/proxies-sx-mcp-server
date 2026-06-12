---
name: proxies-sx-mcp-server
description: Manage Proxies.sx mobile/residential proxies, mint x402 USDC sessions, rotate IPs, and consume marketplace data services from any MCP-compatible AI agent (Claude Desktop, Cursor, Windsurf, Continue, Cline, Claude Code). Trigger this skill the moment the user wants to install / configure / use the Proxies.sx MCP server, integrate proxies into a Claude Desktop or Cursor workflow, mint a proxy without an API key (x402 autonomous mode), build an AI scraping agent that buys its own bandwidth, troubleshoot MCP tool errors, or pick between API-key mode and x402 wallet mode. Use it whenever the user mentions "Proxies.sx MCP", "@proxies-sx/mcp-server", "MCP proxy tools", "Claude Desktop proxy", "x402 mcp", "agent proxy purchase", "proxy MCP", or anything implying machine-driven proxy management — even if they don't explicitly ask for "this skill".
---

# Proxies.sx MCP Server

Open-source [Model Context Protocol](https://modelcontextprotocol.io) server that exposes 61 typed tools to any MCP-compatible AI agent. Two operating modes:

- **API Key mode** — agent acts on behalf of a logged-in Proxies.sx user (44 tools: ports, rotation, billing, payments, support, etc.)
- **x402 Autonomous mode** — agent pays for its own proxies with USDC on Base or Solana, no human account needed (17 tools: `x402_get_proxy`, `x402_rotate_ip`, `x402_get_pool_access`, …)

Source: <https://github.com/bolivian-peru/proxies-sx-mcp-server> · npm: [`@proxies-sx/mcp-server`](https://www.npmjs.com/package/@proxies-sx/mcp-server) · License: MIT.

---

## When to use this skill

Use it for any of these intents:

- "Set up Proxies.sx MCP in Claude Desktop / Cursor / Windsurf / Cline / Continue"
- "Configure my agent to buy proxies with USDC"
- "Add the proxy MCP server to my AI workflow"
- "Help me debug an MCP tool error from `@proxies-sx/mcp-server`"
- "Pick between API key and x402 mode"
- "What tools does the Proxies.sx MCP have?"
- "How do I scrape with mobile IPs from Claude / Cursor?"
- "Use x402 to mint a proxy from my agent"
- "My agent wallet balance is low — top up the session"

If the user mentions any of: `@proxies-sx/mcp-server`, MCP proxy, x402 MCP, agent-driven proxy buying, AGENT_WALLET_KEY, PROXIES_API_KEY env var, `psx_` keys, `pak_` keys (in MCP context), or `mcp.json` configuration — this skill applies.

---

## Decide the mode FIRST

Before installing or generating code, ask which mode the user wants. They behave very differently.

### Mode A — API Key (44 tools, requires Proxies.sx account)

Use when the user already has a Proxies.sx account and wants their agent to manage **their** proxy fleet.

- Tools: account, ports, rotation, billing, crypto payments, support tickets, x402 session management
- Auth: `PROXIES_API_KEY=psx_...` env var (mint at [client.proxies.sx/account](https://client.proxies.sx/account))
- Cost: pays from the user's existing account balance

### Mode B — x402 Autonomous (17 tools, no account needed)

Use when the user is building an **autonomous agent** that should pay for its own bandwidth without human intervention.

- Dedicated-proxy tools: `x402_get_proxy`, `x402_get_pricing`, `x402_wallet_balance`, `x402_rotate_ip`, `x402_list_sessions`, `x402_check_session`, `x402_list_countries`, `x402_list_cities`, `x402_list_carriers`, `x402_service_status`
- Pool Gateway tools: `x402_get_pool_access`, `x402_pool_credit`, `x402_pool_topup`, `x402_pool_regenerate`, `x402_pool_connection`, `x402_pool_pricing`, `get_pool_stock`
- Auth: `AGENT_WALLET_KEY=<base58 Solana key | hex EVM key>` env var
- Cost: USDC paid per request from the agent's own wallet (Solana ~$0.0001 gas, Base ~$0.01 gas). $4/GB, metered.

### Mode C — Both at once

The MCP server happily exposes both modes simultaneously. Set both env vars; tools that need API key use it, tools that need wallet use that. Many production setups run both.

---

## Install — copy-paste configs

The user just needs **one of these blocks** in their MCP client's config file. Generate the right one based on their client + chosen mode.

### Claude Desktop

File: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows)

**Mode A (API Key):**
```json
{
  "mcpServers": {
    "proxies-sx": {
      "command": "npx",
      "args": ["-y", "@proxies-sx/mcp-server"],
      "env": {
        "PROXIES_API_KEY": "psx_YOUR_API_KEY"
      }
    }
  }
}
```

**Mode B (x402 Autonomous):**
```json
{
  "mcpServers": {
    "proxies-sx": {
      "command": "npx",
      "args": ["-y", "@proxies-sx/mcp-server"],
      "env": {
        "AGENT_WALLET_KEY": "your_solana_or_base_private_key",
        "PREFERRED_NETWORK": "solana"
      }
    }
  }
}
```

**Mode C (both):** combine both env vars in the same `env` object.

After editing, fully quit Claude Desktop and reopen — MCP servers are loaded at startup.

### Cursor

File: `.cursor/mcp.json` in the project root.

```json
{
  "mcpServers": {
    "proxies-sx": {
      "command": "npx",
      "args": ["-y", "@proxies-sx/mcp-server"],
      "env": { "PROXIES_API_KEY": "psx_YOUR_API_KEY" }
    }
  }
}
```

### Windsurf

Same JSON shape, in `~/.codeium/windsurf/mcp_config.json`.

### Cline / Continue / Roo Code

All use the same `mcpServers` JSON format. Drop the same block into their config (paths vary).

### Verify install

```bash
npx -y @proxies-sx/mcp-server --help
# Should print version + usage.
```

If your MCP client has a "Tools" panel, you should see ~61 tools prefixed `proxies-sx`. If you see 0, the env vars are missing or the binary failed to download — check the client's MCP error log.

---

## Tool catalog

61 tools organized by category. Use the table to pick the right tool for the user's intent.

### API Key mode (44 tools)

| Category | Count | Representative tools |
|---|---|---|
| Account | 2 | `get_account_summary`, `get_account_usage` |
| Port management | 7 | `list_ports`, `create_port`, `delete_port`, `update_port_credentials`, `update_os_fingerprint`, `reconfigure_port`, `get_port` |
| Port status | 4 | `get_port_status`, `get_port_ip`, `ping_port`, `speed_test_port` |
| Rotation | 5 | `rotate_port`, `check_rotation_availability`, `configure_auto_rotation`, `get_rotation_history`, `get_rotation_token_url` |
| Billing | 4 | `get_pricing` ($4/GB metered), `calculate_price`, `purchase_shared_traffic`, `purchase_private_traffic` (legacy; metered $4/GB) |
| Crypto payments | 5 | `create_crypto_payment`, `check_crypto_payment_status`, `get_pending_crypto_payments`, `cancel_crypto_payment`, `get_crypto_payment_info` |
| Reference | 1 | `list_available_countries` |
| Utilities | 3 | `get_proxy_connection_string`, `get_all_proxy_formats`, `get_os_fingerprint_options` |
| Support | 5 | `create_support_ticket`, `list_my_tickets`, `get_ticket`, `reply_to_ticket`, `close_ticket` |
| x402 session mgmt | 8 | `get_x402_session`, `list_x402_ports`, `get_x402_port_status`, `get_sessions_by_wallet`, `get_session_status`, `replace_x402_port`, `calculate_x402_topup`, `topup_x402_session` |

### x402 Autonomous mode (17 tools)

**Dedicated proxy (10 tools)**

| Tool | What it does |
|---|---|
| `x402_get_proxy` | Buy a dedicated proxy with USDC ($4/GB, metered). Pays on-chain, returns credentials. |
| `x402_get_pricing` | Get current pricing ($4/GB, metered). |
| `x402_wallet_balance` | Check the agent's USDC balance on Base + Solana. |
| `x402_list_sessions` | List the agent's active sessions. |
| `x402_check_session` | Status of a specific session by token. |
| `x402_rotate_ip` | Rotate the IP for a session (free). |
| `x402_list_countries` | Available countries with live device counts. |
| `x402_list_cities` | Cities in a country. |
| `x402_list_carriers` | Mobile carriers in a country. |
| `x402_service_status` | Health check for the x402 service. |

(To extend a dedicated-port session, use `calculate_x402_topup` / `topup_x402_session` from the session-management group.)

**Pool Gateway access (7 tools)** — one credential reaches every country in your tier via the username DSL. v1 tier = `mbl` ($4/GB, production modems, HTTP :7000).

| Tool | What it does |
|---|---|
| `x402_get_pool_access` | Buy Pool Gateway access with USDC. Returns one DSL credential + caches the session token. |
| `x402_pool_credit` | Remaining GB for a pool session (cached token if omitted). |
| `x402_pool_topup` | Pay USDC for more GB (duration-only is free). |
| `x402_pool_regenerate` | Rotate the credential secret (same username, new password). |
| `x402_pool_connection` | Re-emit credentials (recovery). |
| `x402_pool_pricing` | Tier catalog + username DSL (no auth needed). |
| `get_pool_stock` | Public online endpoint counts per country (no IPs). |

> Pool quality copy: `mbl` is the production tier. **Sticky pins the modem, not the IP** — carrier NAT may still re-issue the egress IP. Never claim peer reliability.

---

## Common patterns

Generate code that matches the user's intent. Here are the recipes most users want:

### "Buy a proxy and use it" (x402 mode)

```
1. Tool: x402_get_proxy with country="us", traffic=1, tier="shared"
2. Save the returned sessionToken (x402s_...) and proxy credentials
3. Use the proxy in any HTTP client
4. When done, optional: calculate_x402_topup + topup_x402_session to add traffic
```

### "Buy pool access, one credential for every country" (x402 mode)

```
1. Tool: x402_pool_pricing — see the tier catalog + username DSL (no wallet needed)
2. Tool: get_pool_stock — check which countries currently have capacity
3. Tool: x402_get_pool_access with traffic_gb=5 (tier defaults to mbl)
4. Use the returned credential, switching country via the username DSL:
   psx_xxx-mbl-us, psx_xxx-mbl-de, ... (HTTP proxy on port 7000)
5. Tool: x402_pool_credit — check remaining GB; x402_pool_topup to add more
```

### "Manage my account's proxies" (API key mode)

```
1. Tool: list_ports — see what you have
2. Tool: create_port with country="us" — add a new one
3. Tool: get_proxy_connection_string with portId — get formatted URLs
4. Tool: rotate_port — get a new IP on demand
5. Tool: configure_auto_rotation with interval=30 — set up auto IP rotation every 30 minutes
```

### "Refill my proxy session before it expires"

```
1. Tool: x402_check_session with sessionToken — see remaining traffic + duration
2. Tool: calculate_x402_topup with addTrafficGB=2 — preview cost
3. Tool: topup_x402_session with addTrafficGB=2 + paymentSignature — pay USDC and extend
```

### "Replace an offline port for free" (x402 mode)

```
1. Tool: list_x402_ports with sessionToken — find offline ones
2. Tool: replace_x402_port with portId — get a new port on a different device (free, max 3/session)
```

### "Top up account balance with crypto" (API key mode)

```
1. Tool: create_crypto_payment with amount=50 — get a payment URL/QR
2. User pays at the URL with any of 50+ supported coins
3. Tool: check_crypto_payment_status with paymentId — confirm
4. Balance auto-credited
```

---

## Environment variables

| Var | Required for | Purpose |
|---|---|---|
| `PROXIES_API_KEY` | API key mode | Authenticates as a Proxies.sx user. Format: `psx_*`. Mint at [client.proxies.sx/account](https://client.proxies.sx/account). |
| `AGENT_WALLET_KEY` | x402 mode | Private key for the agent's wallet. Format: base58 (Solana) or 0x-hex (EVM/Base). |
| `PREFERRED_NETWORK` | x402 mode (optional) | `solana` or `base`. Defaults to `solana` (faster + cheaper). |
| `BASE_RPC_URL` | x402 mode (optional) | Override default Base RPC. Default uses public Base RPC. |
| `PROXIES_API_URL` | optional | Override `https://api.proxies.sx/v1` base URL (rarely needed). |

---

## Errors and how to fix them

| Error pattern | Likely cause | Fix |
|---|---|---|
| `401 Unauthorized` on API tool | `PROXIES_API_KEY` missing/revoked | Re-mint at [client.proxies.sx/account](https://client.proxies.sx/account) |
| `403 Forbidden` | API key scope insufficient | Add `customers:write` (or whichever scope the tool needs) |
| `429 Rate limited` | Too many calls in short window | Back off, retry with exponential delay (start 1s) |
| `Insufficient USDC balance` from x402 tool | Wallet has no USDC on the chosen network | Top up the wallet, or `PREFERRED_NETWORK=solana` if cheaper |
| `Tool not found: x402_*` | Server started without `AGENT_WALLET_KEY` | Add the env var, restart the MCP client |
| MCP server not starting | npm registry / network issue | `npx -y @proxies-sx/mcp-server@latest --help` to force fresh install |
| MCP client shows 0 tools | Config syntax error | Validate `claude_desktop_config.json` is valid JSON; quit + reopen client |

The server returns structured errors with a `retryable` boolean and a `suggestion` field — surface those to the user verbatim when an error happens.

---

## Security non-negotiables

DO NOT skip these. Burn them into any setup the user follows:

1. **`PROXIES_API_KEY` is sensitive.** Treat it like a password. Don't paste it in shared chat logs, GitHub gists, or screenshots. If exposed, regenerate it at [client.proxies.sx/account](https://client.proxies.sx/account).
2. **`AGENT_WALLET_KEY` is even more sensitive.** It controls real USDC. Rotate it if exposed; transfer remaining funds to a fresh wallet first.
3. **Don't run the MCP server with `--inspect` or any debugger flag** when these env vars are set — heap dumps include them.
4. **Audit `mcp.json` files in project repos** before committing; the standard pattern is to use a local `.env` and reference it indirectly, not inline secrets.
5. **The `pak_` keys (Pool Gateway sub-keys)** are scoped per-customer, not per-agent — a leaked `pak_` only consumes the reseller's pool, not the platform's.

---

## Pricing rule

Wholesale rates are platform-configurable and change. Don't hardcode dollar amounts when the user asks "how much does X cost". Instead:

- For a precise live answer: `Tool: get_pricing` (API key mode) or `x402_get_pricing` (x402 mode).
- For ballpark guidance: tell the user "the live rate is in your `client.proxies.sx` dashboard or the `/v1/x402/pricing` endpoint — pin nothing in code".

---

## Reference files in the repo

| File | When to read |
|---|---|
| `README.md` | Marketing-friendly overview, install, examples |
| `CHANGELOG.md` | Per-version breaking changes (read before bumping major) |
| `CLAUDE.md` | Repo invariants for agents working ON the MCP server code |
| `recipes/` | Per-framework integration examples (LangChain, CrewAI, raw MCP) |
| `tests/` | Verify behavior — useful when debugging tool responses |
| `src/tools/index.ts` | Tool registry — every API-key tool's source of truth |
| `src/x402/tools.ts` | x402 autonomous tools |

---

## Smoke test (run before reporting "done")

After setting up, verify the MCP client actually sees the tools.

```bash
# 1. Verify the package installs and runs
npx -y @proxies-sx/mcp-server --help
# Should print version + usage info.

# 2. (Optional) Run a single tool via curl-equivalent — only works if the MCP
#    client exposes a way to call tools directly. Most don't, so the real test
#    is asking your AI: "List my proxies via proxies-sx.list_ports"
```

In Claude Desktop / Cursor: ask the agent to call a tool and watch for the `proxies-sx` tool icon to appear in the response.

---

## Checklist before handing off

- [ ] User has `psx_*` and/or `AGENT_WALLET_KEY` env vars set
- [ ] MCP client config file has the `proxies-sx` entry
- [ ] Client fully restarted (not just window reload)
- [ ] User can call at least one tool successfully
- [ ] User knows where to mint a fresh API key if leaked: [client.proxies.sx/account](https://client.proxies.sx/account)
- [ ] User knows pricing is live (don't quote stale numbers)

---

## Links

- npm: <https://www.npmjs.com/package/@proxies-sx/mcp-server>
- Source: <https://github.com/bolivian-peru/proxies-sx-mcp-server>
- Customer dashboard MCP page: <https://client.proxies.sx/mcp-server>
- Master Proxies.sx skill: <https://agents.proxies.sx/skill.md>
- LLM-friendly API reference: <https://api.proxies.sx/v1/reseller/docs/llm>
- Telegram support: [@proxyforai](https://t.me/proxyforai)
