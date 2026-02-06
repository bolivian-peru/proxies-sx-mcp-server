# CLAUDE.md - AI Assistant Context for @proxies-sx/mcp-server

## Project Overview

This is an **MCP (Model Context Protocol) server** that enables AI agents to manage mobile proxy infrastructure on [Proxies.sx](https://proxies.sx). It supports two authentication modes:

1. **API Key Mode** - For users with [Proxies.sx](https://proxies.sx) accounts
2. **x402 Payment Mode** - Autonomous USDC payments without accounts

**Package:** `@proxies-sx/mcp-server`
**npm:** https://www.npmjs.com/package/@proxies-sx/mcp-server
**License:** MIT
**Node.js:** >= 18.0.0

---

## Architecture

```
proxies-sx-mcp/
├── src/
│   ├── index.ts              # Entry point (CLI with shebang)
│   ├── server.ts             # MCP server setup & config loading
│   ├── api/                  # API Key mode - REST client
│   │   ├── client.ts         # HTTP client with auth headers
│   │   ├── auth.ts           # Login & JWT token handling
│   │   ├── types.ts          # TypeScript interfaces
│   │   ├── account.ts        # Account/balance API
│   │   ├── ports.ts          # Port CRUD operations
│   │   ├── rotation.ts       # Port rotation API
│   │   ├── billing.ts        # Purchases API
│   │   ├── payments.ts       # Crypto payments (CoinGate)
│   │   └── reference.ts      # Countries/cities/carriers
│   ├── tools/                # MCP tool definitions (45 tools)
│   │   ├── index.ts          # Tool registry (exports all tools)
│   │   ├── account.ts        # get_account_summary, get_account_usage
│   │   ├── ports.ts          # create_port, delete_port, etc.
│   │   ├── status.ts         # get_port_status, ping_port, etc.
│   │   ├── rotation.ts       # rotate_port, configure_auto_rotation
│   │   ├── billing.ts        # purchase_shared_slots, etc.
│   │   ├── reference.ts      # list_available_countries, etc.
│   │   ├── utilities.ts      # get_proxy_connection_string, etc.
│   │   ├── payments.ts       # create_crypto_payment, etc.
│   │   ├── support.ts        # create_support_ticket, etc.
│   │   └── x402-session.ts   # get_x402_session, list_x402_ports
│   ├── x402/                 # x402 Protocol - autonomous payments (11 tools)
│   │   ├── index.ts          # x402 module setup
│   │   ├── client.ts         # x402 HTTP client (402 flow)
│   │   ├── wallet.ts         # USDC wallet & transaction signing
│   │   ├── handlers.ts       # x402 tool implementations
│   │   ├── session-cache.ts  # Local session caching
│   │   ├── tools.ts          # x402 tool definitions
│   │   └── types.ts          # x402 TypeScript types
│   └── utils/
│       └── formatting.ts     # Text formatting helpers
├── tests/                    # Test files
├── dist/                     # Compiled output (generated)
├── package.json
├── tsconfig.json
├── README.md                 # User documentation
├── CLAUDE.md                 # This file - AI context
├── llm.txt                   # AI discovery document
└── LICENSE
```

---

## Key Files

### Entry Point (`src/index.ts`)
```typescript
#!/usr/bin/env node
import { startMcpServer, getConfigFromEnv } from './server.js';

async function main() {
  const config = getConfigFromEnv();  // Reads environment variables
  await startMcpServer(config);        // Starts stdio transport
}
main();
```

### Server Configuration (`src/server.ts`)
Handles environment variable parsing and MCP server initialization:
- `PROXIES_API_KEY` - API key authentication
- `AGENT_WALLET_KEY` - x402 wallet private key
- `PROXIES_API_URL` - Custom API base URL (default: `https://api.proxies.sx/v1`)
- `PREFERRED_NETWORK` - `base` or `solana` for x402
- `BASE_RPC_URL` - Custom RPC endpoint

### API Client (`src/api/client.ts`)
HTTP client that:
- Adds `X-API-Key` header for API key auth
- Adds `Authorization: Bearer` for JWT auth
- 30-second timeout on all requests
- Automatic error handling and user-friendly messages

### x402 Wallet (`src/x402/wallet.ts`)
Handles USDC transactions on Base network:
- Uses `viem` library for Ethereum interactions
- Signs ERC-20 transfers using private key
- 60-second transaction confirmation timeout
- Balance checking before transactions

---

## API Integration

### Backend API
**Base URL:** `https://api.proxies.sx/v1`

**Authentication:**
- API Key: `X-API-Key: psx_...` header
- JWT: `Authorization: Bearer <token>` header
- x402 Session: `X-Session-Token: x402s_...` header

### Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/ports` | GET | List all ports |
| `/v1/ports` | POST | Create port |
| `/v1/ports/:id` | DELETE | Delete port |
| `/v1/ports/:id/rotate` | POST | Rotate port IP |
| `/v1/account` | GET | Account summary |
| `/v1/x402/proxy` | GET/POST | Purchase proxy (402 flow) |
| `/v1/x402/countries` | GET | Available countries |
| `/v1/x402/calculate` | GET | Calculate cost |
| `/v1/x402/manage/session` | GET | Session details |

**Full API Documentation:** https://proxies.sx/docs

---

## x402 Protocol

### Overview
The [x402 protocol](https://x402.org) enables machine-to-machine payments using HTTP 402 Payment Required.

### Flow
1. Agent requests `/v1/x402/proxy?country=US&duration=3600&traffic=1`
2. Server returns **402 Payment Required** with payment requirements
3. Agent signs USDC transaction using `viem`
4. Agent retries request with `payment-signature` header
5. Server verifies payment on-chain
6. Server returns proxy credentials

### Payment Networks

| Network | USDC Contract | Recipient Wallet |
|---------|---------------|------------------|
| **Base** | `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913` | `0xF8cD900794245fc36CBE65be9afc23CDF5103042` |
| **Solana** | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | `6eUdVwsPArTxwVqEARYGCh4S2qwW2zCs7jSEDRpxydnv` |

### Pricing

| Tier | Port/Hour | Traffic/GB | Example (1hr + 1GB) |
|------|-----------|------------|---------------------|
| Shared | $0.025 | $3.50 | $3.53 |
| Private | $0.056 | $3.70 | $3.76 |

---

## Tools (56 Total)

### API Key Mode (45 Tools)

**Account Tools:**
- `get_account_summary` - Balance, slots, traffic usage
- `get_account_usage` - Detailed traffic breakdown

**Port Management (7 tools):**
- `list_ports` - List all proxy ports
- `get_port` - Get port details
- `create_port` - Create new port
- `delete_port` - Delete port
- `update_port_credentials` - Change login/password
- `update_os_fingerprint` - Set OS spoofing
- `reconfigure_port` - Change port location

**Status Tools (4 tools):**
- `get_port_status` - Online/offline status
- `get_port_ip` - Current public IP
- `ping_port` - Connectivity test
- `speed_test_port` - Download/upload speed

**Rotation Tools (5 tools):**
- `rotate_port` - Rotate to new IP
- `check_rotation_availability` - Check cooldown
- `configure_auto_rotation` - Set interval
- `get_rotation_history` - View history
- `get_rotation_token_url` - Public rotation URL

**Billing Tools (5 tools):**
- `get_pricing` - Current pricing
- `purchase_shared_slots` / `purchase_shared_traffic`
- `purchase_private_slots` / `purchase_private_traffic`

**Crypto Payment Tools (5 tools):**
- `create_crypto_payment` - Create CoinGate order
- `check_crypto_payment_status` - Check status
- `get_pending_crypto_payments` - List pending
- `cancel_crypto_payment` - Cancel payment
- `get_crypto_payment_info` - Supported currencies

**Reference Tools (4 tools):**
- `list_available_countries` - Available countries
- `list_carriers_for_country` - Carriers by country
- `list_cities_for_country` - Cities by country
- `list_regions_for_country` - Regions by country

**Utility Tools (3 tools):**
- `get_proxy_connection_string` - Generate connection string
- `get_all_proxy_formats` - Get all formats
- `get_os_fingerprint_options` - List OS options

**Support Tools (5 tools):**
- `create_support_ticket` - Create ticket
- `list_my_tickets` - List tickets
- `get_ticket` - Get details
- `reply_to_ticket` - Reply
- `close_ticket` - Close ticket

**x402 Session Management (5 tools):**
- `get_x402_session` - Session details
- `list_x402_ports` - Ports in session
- `get_x402_port_status` - Port status
- `get_sessions_by_wallet` - Sessions by wallet
- `get_session_status` - Quick status

### x402 Mode (11 Tools)

- `x402_get_proxy` - Purchase proxy with USDC
- `x402_get_pricing` - Calculate cost
- `x402_wallet_balance` - Check wallet balance
- `x402_list_sessions` - List active sessions
- `x402_check_session` - Session details
- `x402_rotate_ip` - Rotate IP
- `x402_extend_session` - Add more time
- `x402_list_countries` - Available countries
- `x402_list_cities` - Cities in country
- `x402_list_carriers` - Carriers in country
- `x402_service_status` - Health check

---

## Development

### Commands
```bash
npm install          # Install dependencies
npm run build        # Build TypeScript
npm run dev          # Watch mode development
npm run start        # Run compiled server
npm test             # Run tests
npm run lint         # ESLint
```

### Testing with Claude Desktop
Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "proxies-sx": {
      "command": "node",
      "args": ["/path/to/proxies-sx-mcp/dist/index.js"],
      "env": {
        "PROXIES_API_KEY": "psx_your_key"
      }
    }
  }
}
```

---

## Adding New Tools

1. **Define the tool** in appropriate `src/tools/*.ts`:
```typescript
export const myNewTool: Tool = {
  name: 'my_new_tool',
  description: 'Description of what it does',
  inputSchema: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'Parameter 1' }
    },
    required: ['param1']
  }
};
```

2. **Add handler** in `src/tools/index.ts`:
```typescript
case 'my_new_tool':
  return await handleMyNewTool(args);
```

3. **Implement handler**:
```typescript
async function handleMyNewTool(args: any) {
  const result = await apiClient.get('/endpoint');
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }]
  };
}
```

---

## Security Notes

- **API keys** are read from environment variables only
- **Private keys** for x402 are stored in memory
- **No secrets** are hardcoded in source code
- `.env` files are gitignored

### Wallet Addresses (Public - Safe to Commit)
- Base recipient: `0xF8cD900794245fc36CBE65be9afc23CDF5103042`
- Solana recipient: `6eUdVwsPArTxwVqEARYGCh4S2qwW2zCs7jSEDRpxydnv`
- Base USDC: `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913`
- Solana USDC: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`

---

## Links

- **Proxies.sx:** https://proxies.sx
- **Customer Portal:** https://client.proxies.sx
- **API Documentation:** https://proxies.sx/docs
- **MCP Integration:** https://proxies.sx/mcp
- **x402 Protocol:** https://proxies.sx/x402
- **npm Package:** https://www.npmjs.com/package/@proxies-sx/mcp-server
- **GitHub:** https://github.com/proxies-sx/mcp-server

---

**Last Updated:** 2026-01-01
