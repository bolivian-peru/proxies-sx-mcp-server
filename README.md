# @proxies-sx/mcp-server

[![npm version](https://img.shields.io/npm/v/@proxies-sx/mcp-server.svg)](https://www.npmjs.com/package/@proxies-sx/mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Proxies.sx MCP server on Glama](https://glama.ai/mcp/servers/bolivian-peru/proxies-sx-mcp-server/badges/score.svg)](https://glama.ai/mcp/servers/bolivian-peru/proxies-sx-mcp-server)

MCP (Model Context Protocol) server for [Proxies.sx](https://proxies.sx): [residential and mobile proxies](https://agents.proxies.sx/pool/) for AI agents, metered per GB. Claude, Cursor and any MCP client can get rotating or sticky HTTP/SOCKS5 proxy URLs, check live stock per country, rotate IPs and manage usage by themselves, for web scraping, data collection and browser automation.

The main product is the **Pool Gateway**: one endpoint, `gw.proxies.sx` (HTTP `7000`, SOCKS5 `7001`), where the proxy username says which pool, country and session you want. With this server an agent reads live stock, gets its credentials, builds the proxy URL, watches usage and opens a support ticket when something is wrong. It can also manage dedicated ports on carrier modems, Private Pools and Reserved IPs.

Every tool carries MCP annotations (`readOnlyHint`, `destructiveHint`), so a client can ask before a delete, rotate or cancel.

## Quick start

1. Create an API key at [client.proxies.sx/account](https://client.proxies.sx/account) and add traffic (GB) at [client.proxies.sx/purchase](https://client.proxies.sx/purchase).
2. Add the server to your client. Claude Code:

```bash
claude mcp add proxies-sx -e PROXIES_API_KEY=psx_your_api_key_here -- npx -y @proxies-sx/mcp-server
```

3. Ask for a proxy:

> Check Pool Gateway stock for Germany, then give me a sticky residential proxy URL there.

The agent calls `pool_get_stock`, `pool_get_my_credentials` and `pool_build_proxy_url` and answers with a URL such as `http://psx_abc123-peer-de-iptype-residential-sid-job1-rot-sticky:PASSWORD@gw.proxies.sx:7000`.

### API key scopes

A customer key can hold: `ports:read`, `ports:write`, `ports:rotate`, `billing:read`, `account:read`, `account:write`, `traffic:read`, `tickets:read`, `tickets:write`. Select all of them for the full customer tool set.

- `billing:write` is not available to customer keys. The tools that need it (`purchase_shared_traffic`, `create_crypto_payment`, `cancel_crypto_payment`) work with reseller and admin keys only; a customer buys traffic in the dashboard.
- The `pak_` key tools (`pool_mint_key` and the other `pool_*_key` tools) need a reseller account, whose keys hold `customers:read` and `customers:write`.
- The `ops_*` tools answer only to admin keys with `ops:*` scopes.

## Pool Gateway rules

The username grammar is `psx_<account>-<pool>-<country>[-token-value ...]`. `pool_build_proxy_url` writes it for you; these are the rules behind it.

- **Two pools.** `peer` is the main network: residential and mobile devices in most countries. `mbl` is carrier modems in exactly six countries: US, GB, FR, NL, PL and GE. GE is Georgia, not Germany, so `mbl-de` never works: use `peer-de`. `any` and `best` let the gateway choose. `pool_get_stock` shows what is online now.
- **IP class.** `-iptype-mobile`, `-iptype-residential` or `-iptype-isp`. The ISP (static) class is addresses on ISP-registered networks hosted on servers; it is served only when you name it.
- **Rotation.** `sticky` and `hard` both hold one device. `auto5`, `auto10`, `auto20` and `auto60` move to another device on that interval (`auto10` is the default). `ondemand` picks again on each new connection.
- **Sessions need `-sid-`.** `sticky`, `hard` and `auto*` only persist across connections when the username carries `-sid-<id>` (lowercase letters, digits and `_`). `-session-` is not a token: the gateway ignores it without an error.
- **Sticky holds the device, not the IP.** A mobile carrier can change the exit IP of a held modem. For an address that stays, use a residential peer or a Reserved IP.
- **Limits per account:** 500 concurrent connections and 250 sessions.
- **Price:** per GB of traffic, lower per GB on larger purchases; time is free. `get_pricing` reads the live price list. Both pools cost the same.
- **Proxy password.** The gateway password is the account's proxy password (`pool_get_my_credentials`), or a `pak_` key. It is not the account login password.

### Gateway errors

The gateway answers a failed request with `CODE: message (req: id)`. `pool_explain_error` turns any of them into what to do next.

| Code | Status | Meaning |
|---|---|---|
| `E_AUTH_REQUIRED` | 407 | no proxy credentials sent |
| `E_AUTH_INVALID` | 407 | username or proxy password rejected |
| `E_BALANCE_EXHAUSTED` | 407 | credentials are right, the account has no traffic left |
| `E_CAP_EXCEEDED` | 407 | a `pak_` key reached its GB cap |
| `E_RATE_LIMITED_AUTH` | 429 | too many failed logins |
| `E_RATE_LIMITED_CONN` | 429 | over the connection limit |
| `E_SESSION_LIMIT` | 429 | over the session limit |
| `E_NO_STOCK_COUNTRY` | 502 | nothing online for that pool, country and filters |
| `E_STOCK_DEGRADED` | 502 | the device went away during the request |
| `E_SSRF_BLOCKED` | 403 | target is a private or metadata address |
| `E_WRONG_PORT` | 400 | HTTP sent to the SOCKS5 port, or the reverse |
| `E_INTERNAL` | 503 | unexpected gateway error |

A tool that fails returns an MCP error result (`isError: true`) whose text ends with a `What to do:` line for the common cases: a missing or revoked API key, a missing scope, a rate limit, a server error. Keys and passwords are masked in error text.

## Modes and configuration

| Mode | Set | Tools |
|---|---|---|
| **API key** (standard) | `PROXIES_API_KEY` | every tool below except the x402 wallet group |
| **x402 wallet** (optional) | `AGENT_WALLET_KEY` | the x402 wallet group plus the tools marked "also listed in wallet mode" |
| **Both** | both variables | everything |

| Variable | Description |
|---|---|
| `PROXIES_API_KEY` | `psx_` API key from [client.proxies.sx/account](https://client.proxies.sx/account) |
| `PROXIES_EMAIL`, `PROXIES_PASSWORD` | Alternative to the API key: log in with the account credentials |
| `AGENT_WALLET_KEY` | Private key (`0x...`) of a USDC wallet on the Base network, for x402 payments without an account |
| `BASE_RPC_URL` | Custom Base RPC endpoint, for x402 (default `https://mainnet.base.org`) |
| `PROXIES_API_URL` | API base URL. Default `https://api.proxies.sx`; a trailing `/v1` is accepted and ignored. Leave it unset unless you run a private API. |

## Usage with MCP clients

Every client runs the same command, `npx -y @proxies-sx/mcp-server`, with `PROXIES_API_KEY` in the environment.

### Claude Code

```bash
claude mcp add proxies-sx -e PROXIES_API_KEY=psx_your_api_key_here -- npx -y @proxies-sx/mcp-server
```

Add `-s user` to make it available in every project. A project can instead carry a `.mcp.json` in its root with the JSON below.

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows), then restart Claude Desktop:

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

### Cursor

The same JSON in `~/.cursor/mcp.json` (all projects) or `.cursor/mcp.json` (one project).

### Windsurf

The same JSON in `~/.codeium/windsurf/mcp_config.json`.

### Docker

```bash
docker build -t proxies-sx-mcp https://github.com/bolivian-peru/proxies-sx-mcp-server.git
docker run -i --rm -e PROXIES_API_KEY=psx_your_api_key_here proxies-sx-mcp
```

The container speaks MCP over stdio (`-i` is required).

### More recipes

[recipes/](./recipes) has working examples for LangChain, CrewAI and a raw MCP client.

## Tools

<!-- tools:start -->
Generated from the code of version 3.0.1 by `npm run build:manifest`. Do not edit by hand.

**Pool Gateway**

| Tool | What it does |
|---|---|
| `pool_get_stock` | Get live Pool Gateway stock, no account needed. Also listed in wallet mode. |
| `pool_get_facets` | List the cities, states, carriers (with ASN and class) and IP classes that have stock in one country, with counts, no account needed. Also listed in wallet mode. |
| `pool_build_proxy_url` | Build a ready-to-use Pool Gateway proxy URL (gw.proxies.sx, HTTP 7000 or SOCKS5 7001). Also listed in wallet mode. |
| `pool_explain_error` | Explain a Pool Gateway error and say what to do about it. Also listed in wallet mode. |
| `pool_get_my_credentials` | Get your Pool Gateway proxy username and proxy password with ready HTTP and SOCKS5 URLs. |
| `pool_set_proxy_password` | Set a new proxy password (at least 6 characters). |
| `pool_get_my_stats` | Get your own Pool Gateway traffic and open connections, plus the health score of the pool and how many devices are connected to it. |
| `pool_list_sessions` | List your saved Pool Gateway sessions: pool, country, carrier, rotation mode, bytes and last activity. |
| `pool_close_session` | Close one Pool Gateway session by the sessionKey from pool_list_sessions. |
| `pool_close_all_sessions` | Close every saved Pool Gateway session of the account. |

**Private Pool and Reserved IPs**

| Tool | What it does |
|---|---|
| `private_pool_list` | List your Private Pools with their countries, status, gateway username, connection strings with the password masked (private_pool_reveal shows the key) and remaining GB. |
| `private_pool_build` | Create a Private Pool paid from the account's existing GB balance: no purchase, traffic is metered from the same balance. |
| `private_pool_reveal` | Show the gateway password (pak_ key) of a Private Pool. |
| `private_pool_usage` | Get the traffic of a Private Pool per day, in MB. |
| `reserved_ip_list` | List the Reserved IPs a Private Pool holds: country, class, carrier, city, rotation mode, whether the device is online, the exit IP last seen, and connection strings with the password masked. |
| `reserved_ip_reserve` | Reserve one device for a Private Pool so no other customer is routed through it, and get its connection strings with the password masked. |
| `reserved_ip_rotate` | Move a Reserved IP to a different device in the same country now. |
| `reserved_ip_extend` | Change how long a Reserved IP is kept without traffic. |
| `reserved_ip_set_rotation` | Set whether a Reserved IP moves to another device on a schedule: off (hold the device, the default) or every 5, 10, 20 or 60 minutes. |
| `reserved_ip_release` | Give a Reserved IP back to the shared pool. |

**Account**

| Tool | What it does |
|---|---|
| `get_account_summary` | Get the account balance, free port slots, traffic bought and left, and any account alerts. |
| `get_account_usage` | Get traffic purchased, used and still available, split into Pool Gateway traffic and dedicated-port traffic. |

**Billing**

| Tool | What it does |
|---|---|
| `get_pricing` | Get the live price per GB, the volume discounts, the free port-slot tiers and your current tier. |
| `calculate_price` | Calculate what a GB amount costs with the volume discount applied. |
| `purchase_shared_traffic` | Buy traffic in GB from the account balance. |
| `coupon_validate` | Check whether a coupon code is valid for an order, without using it. |
| `coupon_redeem` | Redeem a standalone coupon that grants free GB or port slots to the account. |
| `get_payment_history` | List the account's past payments and crypto top-up orders. |

**Crypto payments**

| Tool | What it does |
|---|---|
| `create_crypto_payment` | Create a crypto order that tops up the account balance and return its hosted payment link. |
| `check_crypto_payment_status` | Check whether a crypto order is still unpaid, confirming, paid, expired or cancelled, and whether the balance was credited. |
| `get_pending_crypto_payments` | List the account's crypto orders that are not finished yet, with their payment links. |
| `cancel_crypto_payment` | Cancel a crypto order that has not been paid yet. |
| `get_crypto_payment_info` | Check whether crypto top-ups are available right now and which currencies the payment page accepts. |

**Dedicated ports**

| Tool | What it does |
|---|---|
| `list_available_countries` | List the countries where a dedicated port can be created right now, with the countryId create_port needs. |
| `list_ports` | List your dedicated ports with status, country, carrier, expiry and port ids. |
| `get_port` | Get one dedicated port with its location and ready-to-use HTTP and SOCKS5 connection strings (contains the port password). |
| `create_port` | Create a dedicated port on a carrier modem and return its connection strings. |
| `delete_port` | Delete a dedicated port and free its slot. |
| `update_port_credentials` | Change the login and/or password of a dedicated port. |
| `update_os_fingerprint` | Set the OS fingerprint (TCP/IP signature) a dedicated port presents. |
| `reconfigure_port` | Move a dedicated port to another country, carrier or city. |
| `extend_port` | Add hours to a dedicated port's expiry. |

**Port status**

| Tool | What it does |
|---|---|
| `get_port_status` | Check whether a dedicated port is online, offline or expired. |
| `get_port_ip` | Get the server address a dedicated port listens on. |
| `ping_port` | Test that a dedicated port answers and measure its latency. |
| `speed_test_port` | Run a speed test through a dedicated port (download, upload, ping). |

**Port rotation**

| Tool | What it does |
|---|---|
| `rotate_port` | Move a dedicated port to another modem in the same location. |
| `check_rotation_availability` | Check whether a dedicated port can be rotated now, how long the cooldown still runs and how many other modems are free. |
| `configure_auto_rotation` | Turn automatic rotation of a dedicated port on or off and set its interval. |
| `get_rotation_history` | Get the past rotations of a dedicated port: when, how triggered, the location it moved to and whether it worked. |
| `get_rotation_token_url` | Get the public rotation link of a dedicated port. |

**Utilities**

| Tool | What it does |
|---|---|
| `get_proxy_connection_string` | Build the HTTP or SOCKS5 connection string of a dedicated port (contains the port password). |
| `get_all_proxy_formats` | Get a dedicated port in every common format: URLs, host:port, environment variables, curl, Python and Node.js snippets, and its public rotation link. |
| `get_service_status` | Check whether Proxies.sx is healthy right now: open Pool Gateway incidents, the state of the API, gateway and relay, and recent uptime. Also listed in wallet mode. |
| `get_os_fingerprint_options` | List the OS fingerprint values create_port and update_os_fingerprint accept. |

**Support**

| Tool | What it does |
|---|---|
| `create_support_ticket` | Open a support ticket that a person at Proxies.sx reads and answers. |
| `list_my_tickets` | List your support tickets with their status and IDs. |
| `get_ticket` | Get one support ticket with the original message and every reply. |
| `reply_to_ticket` | Add a reply to one of your support tickets. |
| `close_ticket` | Close one of your support tickets once the problem is solved. |

**Pool access keys (reseller accounts)**

| Tool | What it does |
|---|---|
| `pool_mint_key` | Create a Pool Access Key (pak_) for one of your customers; it is used as the proxy password. |
| `pool_list_keys` | List your Pool Access Keys with usage, cap and expiry; the key values are masked. |
| `pool_topup_key` | Add GB to a Pool Access Key's cap and/or extend its expiry in one step. |
| `pool_update_key` | Change a Pool Access Key's label, enabled flag, cap, expiry or quality tier. |
| `pool_regenerate_key` | Replace the secret pak_ value of a Pool Access Key. |
| `pool_reveal_key` | Show the full pak_ value of a Pool Access Key. |
| `pool_delete_key` | Delete a Pool Access Key. |
| `pool_key_usage` | Get the traffic of one Pool Access Key per day, in MB. |
| `pool_key_audit` | Get the audit log of one Pool Access Key, newest first: created, changed, topped up, regenerated, revealed, deleted, and gateway logins that worked or failed. |

**x402 session management**

| Tool | What it does |
|---|---|
| `get_x402_session` | Get details of your x402 session including all ports. |
| `list_x402_ports` | List all ports in your x402 session with connection strings and expiration times |
| `get_x402_port_status` | Get detailed status of a specific port including traffic usage and connection info |
| `get_sessions_by_wallet` | List all x402 sessions associated with your wallet address. |
| `get_session_status` | Get quick status check for a session including traffic usage and expiration |
| `replace_x402_port` | Replace an offline port of an x402 session with a new port on another device, at no charge. |
| `calculate_x402_topup` | Calculate what it costs to add traffic and/or time to an x402 session. |
| `topup_x402_session` | Add traffic and/or time to an x402 session. |

**Ops (admin keys only)**

| Tool | What it does |
|---|---|
| `ops_get_user` | Customer 360 view: balance, pool-gateway usage, ports, and (if a farmer) their AI note. |
| `ops_get_user_audit` | Recent ops-agent actions taken on this user. |
| `ops_reconcile_payments` | Read-only Stripe-vs-DB payment view for a user (confirmed total + pending). |
| `ops_list_tickets` | List support tickets (admin view). |
| `ops_reply_ticket` | Post an admin reply to a ticket, optionally emailing the customer. |
| `ops_set_slots` | Set a user's port slot limit (capped). |
| `ops_credit_balance` | Credit a user's balance in USD (admin credit). |
| `ops_email_user` | Send a personalized email to one user (hourly rate-capped). |
| `ops_list_farmers` | List farmer AI notes (shared operational memory). |
| `ops_get_farmer` | Farmer fleet funnel (total/online/verified/listed/routable) + AI note. |
| `ops_write_farmer_note` | Write/append a farmer AI note (situation, nextAction, free note) — shared with future AI sessions. |

**x402 wallet (optional, no account)**

| Tool | What it does |
|---|---|
| `x402_get_proxy` | Buy a dedicated mobile proxy on one carrier modem by paying USDC from the agent wallet; no account needed. |
| `x402_get_pricing` | Get the live x402 price per GB, the smallest purchase, the allowed duration and the payment networks, and compare the cost of a purchase with the wallet balance. |
| `x402_list_sessions` | List the active x402 proxy sessions this wallet bought from this machine, with location, expiry and proxy host. |
| `x402_check_session` | Get status, time left, traffic used and the connection strings of an x402 proxy session. |
| `x402_wallet_balance` | Get the agent wallet address and its USDC and ETH (gas) balance on the Base network. |
| `x402_rotate_ip` | Move an x402 proxy to another modem so it gets a different exit IP. |
| `x402_list_countries` | List the countries where x402_get_proxy can create a proxy right now, with the number of free modems. |
| `x402_extend_session` | Add hours to an x402 proxy session. |
| `x402_service_status` | Check that the x402 payment service is up, and show the wallet balance and how many sessions are active or about to expire. |
| `x402_get_pool_access` | Buy Pool Gateway traffic by paying USDC from the agent wallet; no account needed. |
| `x402_pool_credit` | Get the GB bought, used and left on an x402 pool session. |
| `x402_pool_topup` | Add GB and/or time to an x402 pool session. |
| `x402_pool_regenerate` | Replace the password of an x402 pool credential, for example after a leak. |
| `x402_pool_connection` | Show the gateway host, port, username and password of an x402 pool session again. |
| `x402_pool_usage` | Get the traffic of an x402 pool session per day, in MB. |
| `x402_pool_pricing` | Get the Pool Gateway tiers that can be bought with x402 and their live price per GB and smallest purchase. |
<!-- tools:end -->

[`tools.json`](./tools.json) carries the same list in machine-readable form (name, category, title, first sentence of the description, read-only and destructive flags, mode, parameters).

## Dedicated ports

A dedicated port binds one port to one carrier modem. Modems exist only in US, GB, FR, NL, PL and GE (Georgia); `list_available_countries` shows where a modem is free right now. For every other country use the Pool Gateway.

- `rotate_port` moves the port to another modem. The login and password stay, the port numbers change, and one rotation per 5 minutes is allowed.
- `reconfigure_port` creates a new port in another location and removes the old one: the port ID changes.
- The API never returns the exit IP of a port. Send a request through the proxy to see it.

## Private Pools and Reserved IPs

A Private Pool is a separate gateway credential limited to the countries you choose and paid from the account's GB balance (`private_pool_build`). A Reserved IP holds one device for that pool alone (`reserved_ip_reserve`) until you release it or the idle window ends. The server keeps part of each country's stock unreserved and limits how long a peer device can be held; when it refuses a reservation, its message says why. The ISP (static) class cannot be reserved.

The connection strings of a pool or a Reserved IP come back with `pak_********` as the password: put the key from `private_pool_reveal` in its place.

`reserved_ip_list` shows the exit IP last seen on a reserved device. It is shown to the owner only: do not publish it.

## x402: paying without an account (optional)

An agent with a funded USDC wallet on the Base network can buy traffic without a Proxies.sx account through the [x402 protocol](https://x402.org): the API answers `402 Payment Required` with the price, the server pays on-chain and retries with the transaction hash. Set `AGENT_WALLET_KEY` to enable the wallet tools.

- `x402_get_pool_access` buys Pool Gateway traffic: one credential for every country of the tier (`peer` or `mbl`). `x402_pool_pricing` reads the live tiers and prices.
- `x402_get_proxy` buys one dedicated port on a carrier modem. `x402_list_countries` shows where one is free, `x402_get_pricing` the live price.
- The wallet needs USDC for the purchase and a little ETH for gas, both on Base. `x402_wallet_balance` shows both. (The API also accepts USDC on Solana from clients that pay by themselves; this server's wallet pays on Base.)

The account path (API key and deposited GB) is the standard one; x402 is an alternative for agents that cannot hold an account.

## Earn by sharing bandwidth

Devices that share their connection through the peer SDK are paid per GB served. Terms and setup: [agents.proxies.sx/peer/skill.md](https://agents.proxies.sx/peer/skill.md).

## Registry

| Registry | Entry |
|----------|-------|
| **Official MCP Registry** | `io.github.bolivian-peru/proxies-sx-mcp-server` (see [`server.json`](./server.json)) |
| **npm** | [@proxies-sx/mcp-server](https://www.npmjs.com/package/@proxies-sx/mcp-server) |
| **Glama** | [glama.ai/mcp/servers/bolivian-peru/proxies-sx-mcp-server](https://glama.ai/mcp/servers/bolivian-peru/proxies-sx-mcp-server) |
| **Claude Desktop extension (MCPB)** | [`manifest.json`](./manifest.json), generated by `npm run build:manifest` |

## Troubleshooting

- **"Authentication required" at start.** Neither `PROXIES_API_KEY` nor `AGENT_WALLET_KEY` is set in the environment the client starts the server with.
- **Every tool answers 401.** The key is wrong, expired or revoked. Create a new one at [client.proxies.sx/account](https://client.proxies.sx/account).
- **A tool answers 403 "missing required scope".** Create a key that includes that scope. `billing:write` and `customers:*` cannot be given to a customer key (see above).
- **The proxy answers 407.** Read the error code: `E_AUTH_INVALID` is a wrong proxy password (use `pool_get_my_credentials`), `E_BALANCE_EXHAUSTED` is an empty balance (use `get_account_usage`).
- **The proxy answers 502 `E_NO_STOCK_COUNTRY`.** Nothing is online for that pool, country and filters: check `pool_get_stock` and `pool_get_facets`, and remember that `mbl` exists in six countries only.
- **Claude Desktop does not show the server.** Check the JSON syntax of the config file, make sure Node.js 18 or newer is installed, and restart the app completely.

## Development

```bash
npm install
npm run build            # compile to dist/
npm test                 # unit tests: registry, routes, username grammar, error mapping
npm run lint
npm run build:manifest   # regenerate manifest.json, tools.json and the tool lists in the docs

# Read-only check of every tool against production (needs a real key, changes nothing):
PROXIES_API_KEY=psx_... node tests/live-smoke.mjs
```

## Links

- Website: [proxies.sx](https://proxies.sx)
- Customer dashboard: [client.proxies.sx](https://client.proxies.sx)
- Agent documentation: [agents.proxies.sx](https://agents.proxies.sx/), Pool Gateway guide: [agents.proxies.sx/pool/skill.md](https://agents.proxies.sx/pool/skill.md)
- Support: the `create_support_ticket` tool, [client.proxies.sx/tickets](https://client.proxies.sx/tickets) or [maya@proxies.sx](mailto:maya@proxies.sx)
- x402 specification: [x402.org](https://x402.org)

## License

MIT License, see [LICENSE](LICENSE).
