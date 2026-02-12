# @proxies-sx/mcp-server

[![npm version](https://img.shields.io/npm/v/@proxies-sx/mcp-server.svg)](https://www.npmjs.com/package/@proxies-sx/mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

MCP (Model Context Protocol) server for AI agents to manage [mobile proxy infrastructure](https://proxies.sx) on [Proxies.sx](https://proxies.sx).

This server enables AI assistants like Claude to manage your proxy ports, rotate IPs, purchase resources, and more through natural language commands. Learn more about [MCP integration](https://proxies.sx/mcp) and [x402 autonomous payments](https://proxies.sx/x402).

## Two Authentication Modes

### 1. API Key Mode (Account Required)
Use your [Proxies.sx account](https://client.proxies.sx) and API key to manage existing subscriptions.

### 2. x402 Payment Mode (No Account Needed)
AI agents can autonomously purchase proxies using USDC on Base or Solana networks - no account required! See our [x402 documentation](https://proxies.sx/x402) for details.

---

## Features

- **Account Management**: Check balance, usage, and resource allocation
- **Port Management**: Create, configure, delete proxy ports
- **IP Rotation**: Manual and automatic rotation with customizable settings
- **Status Monitoring**: Check port status, IP addresses, latency, speed
- **Billing**: Purchase slots and traffic using account balance
- **Crypto Payments**: Top up balance with BTC, ETH, USDT, and 50+ cryptocurrencies
- **x402 Autonomous Payments**: AI agents pay with USDC - no account needed
- **Reference Data**: List available countries, carriers, and cities

---

## Installation

### Option 1: npx (Recommended - No Install)

The easiest way to use this MCP server - no installation required:

```bash
npx @proxies-sx/mcp-server
```

### Option 2: npm Install (Global)

Install globally to use the `proxies-sx-mcp` command anywhere:

```bash
npm install -g @proxies-sx/mcp-server
```

After installation, run with:

```bash
proxies-sx-mcp
```

### Option 3: npm Install (Local Project)

Add to your project as a dependency:

```bash
npm install @proxies-sx/mcp-server
```

Then run with:

```bash
npx proxies-sx-mcp
```

### Option 4: From Source

```bash
git clone https://github.com/proxies-sx/mcp-server.git
cd mcp-server
npm install
npm run build
npm start
```

### What Gets Installed

When you run `npm install @proxies-sx/mcp-server`:

```
@proxies-sx/mcp-server (904 KB)
├── @modelcontextprotocol/sdk  (MCP protocol implementation)
├── viem                       (Ethereum/Base wallet operations)
└── zod                        (Input validation)

Total: ~88 MB with all dependencies
```

**Package contents:**
- `dist/` - Compiled JavaScript + TypeScript definitions
- `README.md` - Documentation
- `LICENSE` - MIT License
- `llm.txt` - AI agent discovery document

---

## Verify Installation

After installing, verify the package works:

```bash
# Check version
npm list @proxies-sx/mcp-server

# Test loading (should show "55 tools available")
node -e "const t = require('@proxies-sx/mcp-server/dist/tools'); console.log(t.allToolDefinitions.length + ' tools available')"
```

---

## Configuration

### Environment Variables

| Variable | Mode | Required | Description |
|----------|------|----------|-------------|
| `PROXIES_API_KEY` | API Key | Yes | Your Proxies.sx API key |
| `AGENT_WALLET_KEY` | x402 | Yes | Private key for USDC payments (Base or Solana) |
| `PROXIES_API_URL` | Both | No | Custom API URL (default: `https://api.proxies.sx/v1`) |

### Mode 1: API Key Authentication

1. Log in to [client.proxies.sx](https://client.proxies.sx)
2. Go to Account Settings
3. Create a new API key with scopes:
   - `ports:read`, `ports:write`, `ports:rotate` - Port management
   - `billing:read`, `billing:write` - Purchases
   - `account:read` - Account info
   - `traffic:read` - Usage data

### Mode 2: x402 Autonomous Payments

No account needed! The agent uses a crypto wallet to pay directly:

1. Create a wallet on Base or Solana network
2. Fund it with USDC (minimum $0.40 for 0.1 GB shared, or $4.00 for 1 GB)
3. Add a small amount of ETH (Base) or SOL (Solana) for gas fees (~$0.01)
4. Set `AGENT_WALLET_KEY` to your private key

---

## Usage with Claude Desktop

### API Key Mode

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "proxies-sx": {
      "command": "npx",
      "args": ["-y", "@proxies-sx/mcp-server"],
      "env": {
        "PROXIES_API_KEY": "psx_your_api_key_here"
      }
    }
  }
}
```

### x402 Payment Mode (Autonomous)

```json
{
  "mcpServers": {
    "proxies-sx": {
      "command": "npx",
      "args": ["-y", "@proxies-sx/mcp-server"],
      "env": {
        "AGENT_WALLET_KEY": "0x_your_private_key_here"
      }
    }
  }
}
```

Then restart Claude Desktop.

---

## x402 Protocol - Autonomous AI Payments

The [x402 protocol](https://x402.org) enables machine-to-machine payments using HTTP 402 Payment Required.

### How It Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          x402 PAYMENT FLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   1. Agent requests proxy                                                   │
│   ┌─────────────────────┐       ┌──────────────────────────────────────┐   │
│   │ MCP Server          │──────▶│ api.proxies.sx/v1/x402/proxy        │   │
│   │ @proxies-sx/mcp     │       │                                      │   │
│   └─────────────────────┘       │  Returns 402 Payment Required        │   │
│                                 │  with payment requirements           │   │
│                                 └──────────────────────────────────────┘   │
│                                              │                              │
│   2. Agent signs USDC payment                ▼                              │
│   ┌─────────────────────┐       ┌──────────────────────────────────────┐   │
│   │ Agent Wallet (viem) │       │ Payment Requirements:                │   │
│   │ Signs ERC-20 permit │       │ - Amount: $4.00 USDC (1GB shared)    │   │
│   └──────────┬──────────┘       │ - Network: Base or Solana            │   │
│              │                  │ - Recipient: Proxies.sx wallet       │   │
│              ▼                  └──────────────────────────────────────┘   │
│   3. Payment settled via x402.org facilitator                              │
│   ┌─────────────────────┐       ┌──────────────────────────────────────┐   │
│   │ Retry request with  │──────▶│ Payment verified & settled on-chain │   │
│   │ payment signature   │       │ (Base L2 or Solana)                  │   │
│   └──────────┬──────────┘       └──────────────────────────────────────┘   │
│              │                                                              │
│              ▼                                                              │
│   4. Proxy credentials returned                                            │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ PROXY CREDENTIALS                                                    │   │
│   │ - HTTP: http://user:pass@server:8500                                │   │
│   │ - SOCKS5: socks5://user:pass@server:5500                            │   │
│   │ - Session token for management                                      │   │
│   │ - Rotation URL for IP changes                                       │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### x402 Pricing

Duration is always **FREE** — you only pay for traffic.

| Tier | Port Price | Traffic Price | Min Purchase |
|------|------------|---------------|-------------|
| **Shared** | FREE | **$4.00/GB** | 0.1 GB ($0.40) |
| **Private** | FREE | **$8.00/GB** | 0.1 GB ($0.80) |

Available countries: **DE, PL, US, FR, ES, GB** (dynamic based on device availability)

### Supported Networks

| Network | USDC Address | Recipient |
|---------|--------------|-----------|
| **Base** | `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913` | `0xF8cD900794245fc36CBE65be9afc23CDF5103042` |
| **Solana** | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | `6eUdVwsPArTxwVqEARYGCh4S2qwW2zCs7jSEDRpxydnv` |

### x402 Tools (Detailed)

| Tool | What It Does |
|------|-------------|
| `x402_get_proxy` | Purchase a mobile proxy automatically. Sends USDC on-chain, waits for confirmation, returns proxy credentials (host, port, username, password, session token, rotation token). Specify country, traffic in GB, and tier (shared/private). |
| `x402_get_pricing` | Get current pricing tiers — shared $4/GB, private $8/GB. Shows minimum purchase (0.1 GB), duration rules, and available countries with live device counts. |
| `x402_list_sessions` | List all active proxy sessions for your wallet. Shows session ID, traffic used/remaining, expiration, port count, and status. |
| `x402_check_session` | Get detailed session info by ID — includes all port credentials, traffic stats, and expiration. Use this to retrieve your proxy details. |
| `x402_wallet_balance` | Check your USDC balance on Base or Solana. Shows available funds and whether you have enough for a purchase. |
| `x402_rotate_ip` | Rotate to a new IP address using the rotation token from your proxy purchase. Free, no payment needed. Returns the new IP. |
| `x402_list_countries` | List countries where proxies are available with live device counts. Currently: DE, PL, US, FR, ES, GB. |
| `x402_list_cities` | List available cities within a specific country. |
| `x402_list_carriers` | List mobile carriers available in a country (e.g., AT&T, Verizon, T-Mobile for US). |
| `x402_extend_session` | Add more traffic or extend duration on an existing session. Calculates cost and sends USDC payment automatically. Traffic: $4/GB shared, $8/GB private. Duration extensions are free. |
| `x402_service_status` | Health check — verifies the x402 service is running and accepting payments. |

---

## API Key Mode Tools

### Account Tools

| Tool | Description |
|------|-------------|
| `get_account_summary` | Get account balance and resource usage |
| `get_account_usage` | Get detailed traffic breakdown |

### Port Tools

| Tool | Description |
|------|-------------|
| `list_ports` | List all proxy ports with filters |
| `get_port` | Get detailed port information |
| `create_port` | Create a new proxy port |
| `delete_port` | Delete a proxy port |
| `update_port_credentials` | Update port login/password |
| `update_os_fingerprint` | Set OS fingerprint spoofing |
| `reconfigure_port` | Change port location |

### Status Tools

| Tool | Description |
|------|-------------|
| `get_port_status` | Check if port is online |
| `get_port_ip` | Get current public IP |
| `ping_port` | Test connectivity and latency |
| `speed_test_port` | Measure download/upload speed |

### Rotation Tools

| Tool | Description |
|------|-------------|
| `rotate_port` | Rotate to new IP |
| `check_rotation_availability` | Check if rotation is available |
| `configure_auto_rotation` | Set up automatic rotation |
| `get_rotation_history` | View rotation history |
| `get_rotation_token_url` | Get public rotation URL |

### Billing Tools

| Tool | Description |
|------|-------------|
| `get_pricing` | Get current pricing with volume discounts and slot tiers |
| `calculate_price` | Calculate price for a specific GB amount with volume discounts |
| `purchase_shared_traffic` | Buy shared traffic in GB ($4/GB base). Auto-upgrades slot tier! |
| `purchase_private_traffic` | Buy private traffic in GB ($8/GB base). Auto-upgrades slot tier! |

### Crypto Payment Tools

| Tool | Description |
|------|-------------|
| `create_crypto_payment` | Create crypto payment order ($10-$1000) |
| `check_crypto_payment_status` | Check payment status by order ID |
| `get_pending_crypto_payments` | List all pending payments |
| `cancel_crypto_payment` | Cancel a pending payment |
| `get_crypto_payment_info` | Supported currencies info |

Supported: BTC, ETH, USDT, USDC, LTC, DOGE, TRX, XRP, ADA, SOL, MATIC, AVAX, DOT, LINK, UNI, SHIB, and 50+ more.

### Reference Tools

| Tool | Description |
|------|-------------|
| `list_available_countries` | List available countries with live device counts |

### Utility Tools

| Tool | Description |
|------|-------------|
| `get_proxy_connection_string` | Generate connection string |
| `get_all_proxy_formats` | Get all proxy formats |
| `get_os_fingerprint_options` | List OS fingerprint options |

### Support Tools

| Tool | Description |
|------|-------------|
| `create_support_ticket` | Submit a ticket to contact human support |
| `list_my_tickets` | List all your support tickets |
| `get_ticket` | Get ticket details with conversation history |
| `reply_to_ticket` | Reply to an existing ticket |
| `close_ticket` | Close a resolved ticket |

### X402 Session Management Tools

For agents who purchase via x402 protocol. Use `X-Session-Token` header for authentication.

| Tool | What It Does |
|------|-------------|
| `get_x402_session` | Retrieve full session details — all port credentials (host, http_port, socks_port, username, password), traffic used/remaining, expiration, active status. Uses your X-Session-Token from the purchase response. |
| `list_x402_ports` | List every port in your session with online/offline status, current IP, and traffic consumed per port. |
| `get_x402_port_status` | Check a single port's detailed status — online/offline, current public IP, traffic used, device info, and expiration time. |
| `get_sessions_by_wallet` | List all sessions (active and expired) for your wallet address. Useful for recovering session tokens or reviewing history. |
| `get_session_status` | Quick status check — is the session active, how much traffic remains, when does it expire. |
| `replace_x402_port` | Replace an offline or broken port with a new one on a **different device**. Completely free, max 3 replacements per session. The failed device is excluded from selection. Use when your proxy stops working. |
| `calculate_x402_topup` | Preview the cost of extending your session. Specify `addTrafficGB` and/or `addDurationSeconds`. Duration-only extensions are free ($0). Traffic costs $4/GB shared, $8/GB private. |
| `topup_x402_session` | Pay USDC to extend your session with more traffic or duration. Requires a new on-chain payment. All active ports in the session are automatically extended. Replay-protected (each tx hash can only be used once). |

---

## Browser MCP Server

Separate MCP server for controlling cloud antidetect browsers. Each session includes a **real 4G/5G mobile proxy** automatically — no need to provide your own.

**Package:** `@proxies-sx/browser-mcp`
**Install:** `npx -y @proxies-sx/browser-mcp`
**npm:** https://www.npmjs.com/package/@proxies-sx/browser-mcp

**Auto-Proxy:** Mobile proxy auto-allocated from ProxySmart infrastructure. Countries: DE, GB, FR, ES, PL, US. Cleaned up when session ends.

| Tool | What It Does |
|------|-------------|
| `browser_create` | Create a new isolated browser session with unique fingerprint. Mobile proxy auto-allocated from 6 countries. Returns session ID, CDP URL, and proxy credentials. |
| `browser_go` | Navigate browser to a URL. Waits for page load to complete before returning. |
| `browser_click` | Click an element by CSS selector or coordinates. For buttons, links, and interactive elements. |
| `browser_type` | Type text into an input field by CSS selector. For form filling and search queries. |
| `browser_see` | Take a screenshot AND extract all visible text from page. Returns image and DOM text for analysis. |
| `browser_wait` | Wait for condition: element appears, page loads, network idle, or custom timeout. |
| `browser_extract` | Extract structured data from page using CSS selectors or XPath. |
| `browser_save` | Save browser profile (cookies, localStorage, fingerprint) for later reuse. |
| `browser_end` | End session, clean up resources, release allocated proxy. Always call when done. |

### Claude Desktop Config (Browser)

```json
{
  "mcpServers": {
    "browser": {
      "command": "npx",
      "args": ["-y", "@proxies-sx/browser-mcp"],
      "env": {
        "BROWSER_API_URL": "https://browser.proxies.sx"
      }
    }
  }
}
```

---

## Peer Marketplace — Earn USDC

AI agents can earn USDC by sharing their internet bandwidth as peer proxy nodes.

**Earnings by IP Type:**
- Mobile IPs: **$0.25/GB** (AT&T, Verizon, T-Mobile, Vodafone)
- Residential IPs: **$0.15/GB** (Comcast, Spectrum, Cox)
- Datacenter IPs: **$0.02/GB** (AWS, GCP, Azure, VPNs)

**How it works:**
1. Register: `POST https://api.proxies.sx/v1/peer/agents/register`
2. Get JWT token + device ID
3. Connect to WebSocket relay: `wss://relay.proxies.sx` with `Sec-WebSocket-Protocol: token.{JWT}` header
4. Route proxy_request messages through your connection
5. Respond to heartbeat with heartbeat_ack
6. Earn automatically per GB routed

**Minimum payout:** $5.00 USDC on Solana
**Full docs:** https://agents.proxies.sx/peer/skill.md

---

## Example Conversations

### x402: Get a Proxy (Autonomous)

```
User: I need a US mobile proxy for web scraping

Claude: [Uses x402_get_pricing to calculate cost]
Claude: [Uses x402_get_proxy with country=US, duration=3600, traffic=1]

I've purchased a US mobile proxy for 1 hour with 1GB traffic.
Cost: $4.00 USDC (paid from your agent wallet on Base)

Connection Details:
  HTTP: http://x402_abc123:xyz789@tmcal1.ddns.net:8500
  SOCKS5: socks5://x402_abc123:xyz789@tmcal1.ddns.net:5500

Session ID: 695abc123...
Expires: in 1 hour
```

### Check Account Status

```
User: What's my account status?
Claude: [Uses get_account_summary]
Your account balance is $45.00. You have 5/10 shared slots used and 2.5/10 GB traffic remaining.
```

### Create a Proxy Port

```
User: Create a new shared proxy in Germany
Claude: [Uses list_available_countries to find Germany ID]
Claude: [Uses create_port with countryId and type=shared]
Port created! Here are your connection details:
  HTTP: http://user123:pass456@proxy.example.com:8080
  SOCKS5: socks5://user123:pass456@proxy.example.com:1080
```

### Rotate IP

```
User: Rotate the IP on my main proxy
Claude: [Uses list_ports to find the port]
Claude: [Uses rotate_port]
IP rotated successfully! New IP: 185.123.xxx.xxx
```

### Top Up Balance with Crypto

```
User: I need to add $50 to my balance using crypto
Claude: [Uses create_crypto_payment with amount=50]
I've created a crypto payment order for $50. Here's your payment link:
https://pay.coingate.com/invoice/abc123

Supported: BTC, ETH, USDT, and 50+ more cryptocurrencies.
Balance will be credited automatically once confirmed.
```

### x402: Check Session Status

```
User: How much traffic have I used on my session?
Claude: [Uses get_x402_session with sessionToken]

Your x402 session status:
  Status: Active
  Traffic: 0.35/1.0 GB used (35%)
  Expires: in 45 minutes

Ports:
  - Proxy US-1: http://x402_abc:xyz@tmcal1.ddns.net:8500
    Rotation URL: https://api.proxies.sx/rotate/tok_...
```

### Contact Human Support

```
User: I'm having issues with my proxy not connecting, can you open a ticket?
Claude: [Uses create_support_ticket]

I've created a support ticket for you:
  Ticket ID: 695abc...
  Subject: Proxy Connection Issues
  Status: Open

The Proxies.sx support team will respond as soon as possible.
You can use `get_ticket` to check for updates.
```

---

## API Endpoints

### x402 Endpoints (No Auth Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/v1/x402/health` | Service health check |
| GET/POST | `/v1/x402/pricing` | Get pricing info |
| GET/POST | `/v1/x402/calculate` | Calculate cost |
| GET/POST | `/v1/x402/proxy` | Purchase proxy (402 flow) |
| GET | `/v1/x402/session/:id` | Get session by ID |
| GET | `/v1/x402/session/tx/:txHash` | Get session by tx hash |
| GET | `/v1/x402/sessions/wallet/:wallet` | List sessions by wallet |
| GET | `/v1/x402/sessions/:id/status` | Get session status |

### x402 Session Management (Session Token Auth)

Use `X-Session-Token` header with the token from purchase response:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/x402/manage/session` | Get session details + ports |
| GET | `/v1/x402/manage/session/credit` | Check remaining credit |
| GET | `/v1/x402/manage/ports` | List all ports in session |
| GET | `/v1/x402/manage/ports/:id/status` | Get detailed port status |
| POST | `/v1/x402/manage/ports/recreate` | Recreate deleted port |
| POST | `/v1/x402/manage/ports/replace` | Replace offline port (free, max 3) |
| GET | `/v1/x402/manage/session/topup/calculate` | Preview top-up cost |
| POST | `/v1/x402/manage/session/topup` | Pay to extend session |

### API Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/ports` | List all ports |
| POST | `/v1/ports` | Create port |
| GET | `/v1/ports/:id` | Get port details |
| DELETE | `/v1/ports/:id` | Delete port |
| POST | `/v1/ports/:id/rotate` | Rotate port |
| GET | `/v1/account` | Get account info |

Full API documentation: [proxies.sx/docs](https://proxies.sx/docs)

---

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Lint code
npm run lint
```

---

## Links

### Proxies.sx
- **Website**: [proxies.sx](https://proxies.sx) - Premium mobile 4G/5G proxy service
- **Customer Portal**: [client.proxies.sx](https://client.proxies.sx) - Manage your proxies and account
- **API Documentation**: [proxies.sx/docs](https://proxies.sx/docs) - Complete REST API reference
- **MCP Integration**: [proxies.sx/mcp](https://proxies.sx/mcp) - AI agent integration guide
- **x402 Payments**: [proxies.sx/x402](https://proxies.sx/x402) - Autonomous USDC payment protocol
- **Support Tickets**: [client.proxies.sx/tickets](https://client.proxies.sx/tickets) - Get help from our team

### Contact & Support
- **Email**: [maya@proxies.sx](mailto:maya@proxies.sx)
- **Telegram**: [@sxproxies](https://t.me/sxproxies)

### x402 Protocol
- **x402 Specification**: [x402.org](https://x402.org) - HTTP 402 payment protocol
- **x402 Registry**: [x402scan.com](https://x402scan.com) - Discover x402 services

---

## Troubleshooting

### "Authentication required" Error

This is **expected behavior** when no credentials are provided:

```
Failed to start MCP server: Authentication required. Set one of:
  Mode 1 (API Key):
    - PROXIES_API_KEY: Your API key from https://client.proxies.sx/account
  Mode 2 (x402 Wallet):
    - AGENT_WALLET_KEY: Your wallet private key for USDC payments
```

**Solution:** Provide authentication via environment variable:

```bash
# With API key
PROXIES_API_KEY=psx_your_key npx @proxies-sx/mcp-server

# With x402 wallet
AGENT_WALLET_KEY=0x_your_private_key npx @proxies-sx/mcp-server
```

### Node.js ExperimentalWarning

If you see this warning on Node.js 23+:

```
ExperimentalWarning: CommonJS module ... is loading ES Module ... using require()
```

**This is harmless** - it's a Node.js warning about ESM/CommonJS interop, not an error. To suppress:

```bash
NODE_NO_WARNINGS=1 npx @proxies-sx/mcp-server
```

### npm Install Fails

If `npm install` fails:

```bash
# Clear npm cache
npm cache clean --force

# Try installing again
npm install @proxies-sx/mcp-server

# Or use a specific registry
npm install @proxies-sx/mcp-server --registry https://registry.npmjs.org
```

### Package Not Found

If you get "package not found" error:

```bash
# Check if package exists
npm view @proxies-sx/mcp-server

# Update npm
npm install -g npm@latest

# Try again
npm install @proxies-sx/mcp-server
```

### Verify Package Integrity

```bash
# Check installed version
npm list @proxies-sx/mcp-server

# Verify package loads correctly
node -e "require('@proxies-sx/mcp-server/dist/tools')" && echo "OK"

# Check tool count (should be 55)
node -e "console.log(require('@proxies-sx/mcp-server/dist/tools').allToolDefinitions.length)"
```

### Claude Desktop Not Detecting MCP Server

1. Ensure config file is in correct location:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

2. Verify JSON syntax is valid

3. Restart Claude Desktop completely (quit and reopen)

4. Check Claude Desktop logs for errors

---

## About Proxies.sx

[Proxies.sx](https://proxies.sx) provides premium mobile 4G/5G proxy infrastructure for web scraping, ad verification, social media automation, and more. Our [MCP server](https://proxies.sx/mcp) enables seamless integration with AI assistants, and our [x402 protocol support](https://proxies.sx/x402) allows AI agents to autonomously purchase and manage proxies without human intervention.

---

## License

MIT License - see [LICENSE](LICENSE) file.

---

Built with love by [Proxies.sx](https://proxies.sx)
