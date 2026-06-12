<div align="center">

# 🛰️ @proxies-sx/mcp-server

**The Model Context Protocol server that lets AI agents buy and run mobile proxies — by themselves.**

[![npm version](https://img.shields.io/npm/v/@proxies-sx/mcp-server.svg)](https://www.npmjs.com/package/@proxies-sx/mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP](https://img.shields.io/badge/MCP-compatible-7c5cff.svg)](https://modelcontextprotocol.io)
[![tools](https://img.shields.io/badge/tools-61-3aa0ff.svg)](#-tool-catalog-61-tools)
[![x402](https://img.shields.io/badge/x402-USDC%20on%20Base%20%2B%20Solana-39c5cf.svg)](#-x402--autonomous-onchain-payments)

[Quickstart](#-30-second-quickstart) · [Two modes](#-two-ways-to-authenticate) · [Tool catalog](#-tool-catalog-61-tools) · [x402](#-x402--autonomous-onchain-payments) · [Docs](https://client.proxies.sx/mcp-server) · [AI hub](https://agents.proxies.sx)

</div>

---

Give Claude (or any MCP client) the keys to a real **mobile-proxy network**: create ports, rotate IPs, buy traffic, check status, open support tickets — all through natural language. Two ways to pay: a normal **API key**, or **x402** so an agent pays **USDC on-chain with no account at all**.

```text
You:  "Get me a US mobile proxy with 2 GB and rotate the IP."
Claude → x402_get_proxy(country=US, trafficGB=2)  →  pays $8 USDC on Base  →  returns live creds
Claude → x402_rotate_ip()                          →  fresh carrier IP

You:  "Buy me pool access so I can hit any country with one credential."
Claude → x402_get_pool_access(traffic_gb=5)        →  pays $20 USDC  →  one DSL credential
```

> **Mobile proxies, metered honestly.** Real 4G/5G carrier IPs across 6+ countries. **$4 / GB, metered, GB never expires.** Duration is always free — you only pay for data. (The legacy private/dedicated tier was removed.)

---

## 👥 Two audiences — pick your door

| You are… | You want to… | Use |
|---|---|---|
| **An AI agent / developer / buyer** | Buy and operate proxies programmatically | **This MCP server** (or the [REST API](https://api.proxies.sx/v1)) |
| **A device owner / farmer** | *Earn* by sharing bandwidth from phones | The **Peer SDK** → [agents.proxies.sx/peer](https://agents.proxies.sx/peer) |

This server is the **buyer / consumer** side. Farming and peer registration is a separate flow with its own SDK — see the peer hub above. (No peer-registration tools live here by design.)

---

## ⚡ 30-second quickstart

```bash
# No install needed — just run it
npx @proxies-sx/mcp-server
```

Then drop it into your MCP client. For **Claude Desktop**, edit
`~/Library/Application Support/Claude/claude_desktop_config.json`:

```jsonc
{
  "mcpServers": {
    "proxies-sx": {
      "command": "npx",
      "args": ["-y", "@proxies-sx/mcp-server"],
      "env": {
        // Pick ONE mode (see below)
        "PROXIES_API_KEY": "psx_your_api_key_here"
        // — or — autonomous on-chain payments:
        // "AGENT_WALLET_KEY": "0xYOUR_PRIVATE_KEY"
      }
    }
  }
}
```

Restart Claude Desktop → you'll see **61 tools** available. Works the same in Cursor, Cline, Continue, or any MCP-compatible client.

---

## 🔑 Two ways to authenticate

### Mode 1 — API key (you have an account)

1. Log in to [client.proxies.sx](https://client.proxies.sx) → **Account → API Keys**.
2. Create a key with the scopes you need: `ports:read` `ports:write` `ports:rotate` `billing:read` `billing:write` `account:read` `traffic:read`.
3. Set `PROXIES_API_KEY=psx_…`.

Best for: existing customers, dashboards, scripts, persistent automation.

### Mode 2 — x402 (no account, the agent pays on-chain) 🤖

1. Create a wallet on **Base** or **Solana**.
2. Fund it with **USDC** (min $0.40 for 0.1 GB) + a few cents of ETH/SOL for gas.
3. Set `AGENT_WALLET_KEY=<private key>`.

The agent now buys proxies **autonomously** — it signs a USDC payment, the server verifies it on-chain (~2 s on Base, ~400 ms on Solana), and returns live credentials. No signup, no card, no human.

| Variable | Mode | Required | Default |
|---|---|---|---|
| `PROXIES_API_KEY` | API key | yes (this mode) | — |
| `AGENT_WALLET_KEY` | x402 | yes (this mode) | — |
| `PROXIES_API_URL` | both | no | `https://api.proxies.sx/v1` |

---

## 🧰 Tool catalog (61 tools)

<details open>
<summary><b>Account &amp; billing</b> — balance, pricing, buy traffic</summary>

| Tool | What it does |
|---|---|
| `get_account_summary` | Balance, email, slot &amp; traffic usage |
| `get_account_usage` | Traffic breakdown by category |
| `get_pricing` | Live pricing — **$4/GB, metered**, volume discounts |
| `calculate_price` | Price a GB amount with volume discount applied |
| `purchase_shared_traffic` | Buy GB from balance (also raises your free slot tier) |
| `purchase_private_traffic` | Legacy buy-GB tool (still accepted by the API; price is metered $4/GB) |
</details>

<details>
<summary><b>Ports</b> — create, inspect, reconfigure, delete</summary>

| Tool | What it does |
|---|---|
| `list_ports` | All ports with filters (type, status, location) |
| `get_port` | Full detail for one port |
| `create_port` | New port in a country (optional carrier/city) |
| `reconfigure_port` | Move a port to a new country/carrier/city |
| `update_port_credentials` | Change a port's login/password |
| `update_os_fingerprint` | p0f OS spoofing for a port |
| `delete_port` | Remove a port |
</details>

<details>
<summary><b>Status &amp; utilities</b> — health, IP, formats</summary>

| Tool | What it does |
|---|---|
| `get_port_status` · `get_port_ip` · `ping_port` · `speed_test_port` | Online check, current IP, latency, speed |
| `get_proxy_connection_string` · `get_all_proxy_formats` | Ready-to-paste HTTP/SOCKS5 strings, every common format |
| `get_os_fingerprint_options` · `list_available_countries` | Spoofing options, live country availability |
</details>

<details>
<summary><b>Rotation</b> — change IP on demand or on a schedule</summary>

| Tool | What it does |
|---|---|
| `rotate_port` | Swap to a new modem/IP, keep credentials |
| `check_rotation_availability` | Cooldown / circuit-breaker check |
| `configure_auto_rotation` | Auto-rotate every N minutes |
| `get_rotation_history` · `get_rotation_token_url` | Audit trail · public no-auth rotate URL |
</details>

<details>
<summary><b>Crypto top-ups (CoinGate)</b> — fund a balance with crypto</summary>

| Tool | What it does |
|---|---|
| `create_crypto_payment` · `check_crypto_payment_status` | Open a hosted crypto order · poll it |
| `get_pending_crypto_payments` · `cancel_crypto_payment` · `get_crypto_payment_info` | Manage pending orders, supported coins |
</details>

<details>
<summary><b>Support</b> — talk to humans from inside the agent</summary>

`create_support_ticket` · `list_my_tickets` · `get_ticket` · `reply_to_ticket` · `close_ticket`
</details>

<details>
<summary><b>x402 session management</b> — operate a session bought on-chain</summary>

| Tool | What it does |
|---|---|
| `get_x402_session` · `list_x402_ports` · `get_x402_port_status` | Session detail, all ports, per-port status |
| `get_sessions_by_wallet` · `get_session_status` | Recover sessions by wallet · quick status |
| `replace_x402_port` | Swap an offline port to a new device — **free, max 3/session** |
| `calculate_x402_topup` · `topup_x402_session` | Preview top-up · pay USDC to add traffic/duration |
</details>

<details>
<summary><b>x402 autonomous</b> — buy &amp; run proxies with a wallet, no account</summary>

| Tool | What it does |
|---|---|
| `x402_get_proxy` | **Buy a dedicated proxy with USDC on-chain** — returns creds + session token |
| `x402_get_pricing` | Quote a purchase ($4/GB metered, duration free) |
| `x402_wallet_balance` | USDC balance + wallet address |
| `x402_rotate_ip` | Free IP rotation via rotation token |
| `x402_list_sessions` · `x402_check_session` | List / inspect your wallet's sessions |
| `x402_list_countries` · `x402_list_cities` · `x402_list_carriers` | Live geo + carrier targeting |
| `x402_service_status` | Health check |

To extend a dedicated-port session, use the session-management `calculate_x402_topup` / `topup_x402_session` tools.
</details>

<details>
<summary><b>x402 Pool Gateway access</b> 🆕 — one credential, every country in your tier</summary>

| Tool | What it does |
|---|---|
| `x402_get_pool_access` | **Buy Pool Gateway access with USDC** — one DSL credential reaches every country in your tier. v1 = `mbl` ($4/GB, production modems), HTTP :7000 |
| `x402_pool_credit` | Remaining GB on the pool session (cached token if omitted) |
| `x402_pool_topup` | Pay USDC for more GB (duration-only is free) |
| `x402_pool_regenerate` | Rotate the credential secret (same username, new password) |
| `x402_pool_connection` | Re-emit credentials (recovery) |
| `x402_pool_pricing` | Tier catalog + username DSL (no auth) |
| `get_pool_stock` | Public online endpoint counts per country (no IPs) |

> One credential, every country: `psx_xxx-mbl-us`, `psx_xxx-mbl-de`, … via the username DSL.
> **Sticky pins the modem, not the IP** — carrier NAT may still re-issue the egress IP.
</details>

---

## 💸 x402 — autonomous on-chain payments

[x402](https://www.x402.org) revives **HTTP 402 Payment Required** for the agent economy. Your agent requests a proxy, gets a price, signs a USDC transfer, and retries with the transaction — the server verifies on-chain and provisions instantly.

```
agent ──▶ x402_get_proxy(US, 2GB)
          │  402 Payment Required → pay $8 USDC
          ▼
   Base (eip155:8453)  or  Solana   ──▶  on-chain verify  ──▶  live proxy creds + session token
```

- **Pricing:** **$4 / GB, metered** (the legacy private/dedicated tier was removed). **Duration is free.** Min $0.40.
- **Networks:** Base (USDC, ~2 s) and Solana (USDC, ~400 ms).
- **No account, no card, no human.** The wallet *is* the identity.
- **Pool Gateway access:** buy one credential that reaches every country in your tier with `x402_get_pool_access` (v1 `mbl` tier, $4/GB).

Build agents directly on the protocol with the open-source SDK: `@proxies-sx/x402-core`, `@proxies-sx/x402-hono`, `@proxies-sx/x402-solana`.

---

## 📚 Recipes &amp; deeper docs

- **In-app docs & setup wizard:** [client.proxies.sx/mcp-server](https://client.proxies.sx/mcp-server)
- **AI-agent hub (x402, skill files, marketplace):** [agents.proxies.sx](https://agents.proxies.sx)
- **Agent skill file (drop-in for Claude):** [agents.proxies.sx/skill.md](https://agents.proxies.sx/skill.md)
- **Live system map:** [agents.proxies.sx/system-map](https://agents.proxies.sx/system-map)
- **Pool Gateway DSL & docs:** [client.proxies.sx/pool-proxy](https://client.proxies.sx/pool-proxy)
- **Want to *earn* instead of buy?** [agents.proxies.sx/peer](https://agents.proxies.sx/peer)
- Ready-made flows live in [`recipes/`](./recipes); machine-readable catalog in [`SKILL.md`](./SKILL.md) and [`llm.txt`](./llm.txt).

---

## 🛠️ Install options

```bash
npx @proxies-sx/mcp-server          # zero-install (recommended)
npm i -g @proxies-sx/mcp-server     # global → `proxies-sx-mcp`
npm i @proxies-sx/mcp-server        # local dependency
```

From source:

```bash
git clone https://github.com/bolivian-peru/proxies-sx-mcp-server
cd proxies-sx-mcp-server && npm install && npm run build && npm start
```

Verify: `npx @proxies-sx/mcp-server --version` (it should report **61 tools available**).

---

## 🤝 Contributing &amp; support

Issues and PRs welcome. Need a human? Use the `create_support_ticket` tool, or reach the team at [client.proxies.sx](https://client.proxies.sx). Licensed **MIT**.

<div align="center"><sub>Built for the agent economy · <a href="https://proxies.sx">Proxies.sx</a></sub></div>
