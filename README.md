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

# Test loading (should show "56 tools available")
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
2. Fund it with USDC (minimum $3.53 for 1 hour + 1 GB)
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
│   │ Signs ERC-20 permit │       │ - Amount: $3.53 USDC (1hr + 1GB)     │   │
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

| Tier | Port Price | Traffic Price | Example (1hr + 1GB) |
|------|------------|---------------|---------------------|
| **Shared** | $0.025/hr | $3.50/GB | **$3.53** |
| **Private** | $0.056/hr | $3.70/GB | $3.76 |

### Supported Networks

| Network | USDC Address | Recipient |
|---------|--------------|-----------|
| **Base** | `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913` | `0xC6C3a87363D5b37d9510202015369086e25558f1` |
| **Solana** | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | `6qJVQ61ygwjuB7DK94ccrAcxgiQkc2tbbWeNCr3FT2HY` |

### x402 Tools

| Tool | Description |
|------|-------------|
| `x402_get_proxy` | Purchase proxy with USDC payment |
| `x402_get_pricing` | Calculate cost for duration + traffic |
| `x402_list_sessions` | List active proxy sessions |
| `x402_check_session` | Get session details by ID |
| `x402_wallet_balance` | Check USDC wallet balance |
| `x402_rotate_ip` | Rotate proxy IP address |
| `x402_list_countries` | Available countries |
| `x402_list_cities` | Cities in a country |
| `x402_list_carriers` | Carriers in a country |
| `x402_extend_session` | Add more time to session |
| `x402_service_status` | Health check |

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
| `get_pricing` | Get current pricing |
| `purchase_shared_slots` | Buy shared port slots |
| `purchase_shared_traffic` | Buy shared traffic (GB) |
| `purchase_private_slots` | Buy private port slots |
| `purchase_private_traffic` | Buy private traffic (GB) |

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
| `list_available_countries` | List available countries |
| `list_carriers_for_country` | List carriers in a country |
| `list_cities_for_country` | List cities in a country |
| `list_regions_for_country` | List regions in a country |

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

For agents who purchase via x402 protocol:

| Tool | Description |
|------|-------------|
| `get_x402_session` | Get session details and ports using session token |
| `list_x402_ports` | List all ports in your x402 session |
| `get_x402_port_status` | Get detailed port status (traffic, expiration) |
| `get_sessions_by_wallet` | List all sessions for your wallet address |
| `get_session_status` | Quick status check for a session |

---

## Example Conversations

### x402: Get a Proxy (Autonomous)

```
User: I need a US mobile proxy for web scraping

Claude: [Uses x402_get_pricing to calculate cost]
Claude: [Uses x402_get_proxy with country=US, duration=3600, traffic=1]

I've purchased a US mobile proxy for 1 hour with 1GB traffic.
Cost: 3.53 USDC (paid from your agent wallet)

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
| GET | `/v1/x402/manage/ports` | List all ports in session |
| GET | `/v1/x402/manage/ports/:id/status` | Get detailed port status |

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

# Check tool count (should be 45)
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
