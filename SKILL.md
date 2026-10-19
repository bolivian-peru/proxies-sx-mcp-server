---
name: proxies-sx-mcp-server
description: Use Proxies.sx residential and mobile proxies from any MCP-compatible AI agent (Claude Desktop, Claude Code, Cursor, Windsurf, Cline, Continue). Trigger this skill when the user wants to install, configure or use the Proxies.sx MCP server, get a proxy URL for the Pool Gateway (gw.proxies.sx), check proxy stock per country, hold a session or an IP, manage dedicated mobile ports, read usage and pricing, open a support ticket, debug an MCP tool or gateway error, or let an agent pay for proxies with USDC (x402). Also when the user mentions "@proxies-sx/mcp-server", "Proxies.sx MCP", "proxy MCP", PROXIES_API_KEY, AGENT_WALLET_KEY, psx_ keys or pak_ keys.
---

# Proxies.sx MCP Server

Open-source [Model Context Protocol](https://modelcontextprotocol.io) server for Proxies.sx: residential and mobile proxy bandwidth, metered per GB.

Source: <https://github.com/bolivian-peru/proxies-sx-mcp-server> · npm: [`@proxies-sx/mcp-server`](https://www.npmjs.com/package/@proxies-sx/mcp-server) · License: MIT.

## What the product is

- **Pool Gateway** (the main product): one endpoint, `gw.proxies.sx` (HTTP `7000`, SOCKS5 `7001`). The proxy username chooses pool, country, IP class, session and rotation. One proxy password works for every country.
- **Dedicated ports**: one port bound to one carrier modem, in the few countries that have modems.
- **Private Pools and Reserved IPs**: a separate gateway credential scoped to chosen countries, which can hold individual devices for itself.

## Pick the mode first

| Mode | Environment | Use it when |
|---|---|---|
| **API key** (standard) | `PROXIES_API_KEY=psx_...` | The user has, or can create, a Proxies.sx account with GB on it. This is the default. |
| **x402 wallet** (optional) | `AGENT_WALLET_KEY=0x...` | The agent must pay by itself in USDC on Base and cannot hold an account. |
| **Both** | both variables | Every tool of both modes is listed. |

Create the key at [client.proxies.sx/account](https://client.proxies.sx/account). A customer key can hold `ports:read`, `ports:write`, `ports:rotate`, `billing:read`, `account:read`, `account:write`, `traffic:read`, `tickets:read`, `tickets:write`. It cannot hold `billing:write`: buying traffic through the API is for reseller and admin keys, and a customer buys in the dashboard at [client.proxies.sx/purchase](https://client.proxies.sx/purchase).

## Install

Every client runs `npx -y @proxies-sx/mcp-server` with the key in the environment.

**Claude Code**

```bash
claude mcp add proxies-sx -e PROXIES_API_KEY=psx_YOUR_API_KEY -- npx -y @proxies-sx/mcp-server
```

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, `%APPDATA%\Claude\claude_desktop_config.json` on Windows), **Cursor** (`~/.cursor/mcp.json` or `.cursor/mcp.json`), **Windsurf** (`~/.codeium/windsurf/mcp_config.json`), Cline, Continue and Roo Code all take the same block:

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

For wallet mode put `AGENT_WALLET_KEY` in `env` instead of, or next to, `PROXIES_API_KEY`. Restart the client after editing its config. To verify, ask the agent to call `get_service_status` (needs no account) and then `get_account_summary`.

## Pool Gateway rules

Username grammar: `psx_<account>-<pool>-<country>[-token-value ...]`. Let `pool_build_proxy_url` write it; it refuses or warns about the mistakes below.

- `peer` is the main pool: residential and mobile devices in most countries. `mbl` is carrier modems in exactly US, GB, FR, NL, PL and GE. **GE is Georgia, not Germany: `mbl-de` never works, use `peer-de`.**
- IP class: `-iptype-mobile`, `-iptype-residential`, `-iptype-isp`. The ISP (static) class is served only when named.
- Rotation: `sticky` and `hard` both hold one device; `auto5`/`auto10`/`auto20`/`auto60` move to another device on that interval; `ondemand` picks again per connection.
- `sticky`, `hard` and `auto*` persist across connections only with `-sid-<id>`. `-session-` is ignored by the gateway without an error.
- Sticky holds the device, not the IP: a mobile carrier can change the exit IP. For an address that stays, use a residential peer or a Reserved IP.
- Limits per account: 500 concurrent connections, 250 sessions.
- You pay per GB; time is free. Never quote a price from memory: call `get_pricing`.
- The gateway password is the proxy password from `pool_get_my_credentials` (or a `pak_` key), not the account login password.

## Common tasks

**Get a proxy for a country (API key mode: start here)**

```
1. pool_get_stock {country: "de"}            -> what is online there, per pool and class
2. pool_get_my_credentials                    -> proxyUsername and proxyPassword
3. pool_build_proxy_url {proxyUsername, password, pool: "peer", country: "de",
                         ipType: "residential", rotation: "sticky", sid: "job1"}
4. use the returned proxyUrl in any HTTP client
```

**Target a city or carrier**: `pool_get_facets {country}` lists the values with stock; pass one as `city`, `state`, `carrier` or `asn` to `pool_build_proxy_url`.

**A request through the proxy failed**: pass the gateway's error text to `pool_explain_error`. `E_AUTH_INVALID` is a wrong proxy password; `E_BALANCE_EXHAUSTED` is an empty balance (check `get_account_usage`, the password is fine); `E_NO_STOCK_COUNTRY` means nothing is online for that pool, country and filters; `E_SESSION_LIMIT` is cleared with `pool_close_all_sessions`.

**Check balance and usage**: `get_account_summary`, `get_account_usage`.

**Hold one IP for yourself**: `private_pool_list` (or `private_pool_build {countries}`), then `reserved_ip_reserve {poolId, country}`; release it with `reserved_ip_release`. The connection strings come back with `pak_********` as the password: put the key from `private_pool_reveal {poolId}` in its place. The server refuses when a country has too little unreserved stock and says so.

**A dedicated port on a carrier modem**

```
1. list_available_countries                   -> countries with a free modem, and their countryId
2. create_port {countryId}                    -> connection strings
3. rotate_port {portId}                       -> another modem; the port numbers change
4. configure_auto_rotation {portId, enabled: true, intervalMinutes: 30}
5. delete_port {portId}
```

**Reach a person**: `create_support_ticket {subject, message}`, then `get_ticket`.

**Pay with a wallet instead of an account (x402 mode)**

```
1. x402_pool_pricing, pool_get_stock          -> tiers, live prices, stock
2. x402_wallet_balance                        -> USDC and gas on Base
3. x402_get_pool_access {tier: "peer", traffic_gb: 1}   -> pays on-chain, returns one credential
4. pool_build_proxy_url with that username and password
5. x402_pool_credit / x402_pool_topup         -> GB left / add more
```

## Tool catalog

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

## Errors

A failing tool returns an MCP error result (`isError: true`). For the common cases the text ends with a `What to do:` line; follow it instead of retrying blindly.

| Error | Cause | Fix |
|---|---|---|
| 401 on any API tool | `PROXIES_API_KEY` missing, wrong, expired or revoked | New key at [client.proxies.sx/account](https://client.proxies.sx/account) |
| 403 "missing required scope" | The key lacks that scope | Create a key with it. `billing:write` and `customers:*` are not available to customer keys |
| 429 | Rate limit | Wait a minute; do not loop |
| 5xx | Server-side failure | Retry once, then `get_service_status` |
| "Insufficient USDC balance" (x402) | Wallet cannot cover the price | Send USDC on Base to the wallet address in the message |
| "Unknown tool: x402_..." | Server started without `AGENT_WALLET_KEY` | Add it and restart the client |
| Client shows no tools | Config file is not valid JSON, or no key is set | Fix the file, restart the client |

## Security

1. `PROXIES_API_KEY` is a password. Never paste it into shared logs, gists or screenshots. If exposed, revoke it at [client.proxies.sx/account](https://client.proxies.sx/account).
2. `AGENT_WALLET_KEY` controls real USDC. Use a wallet that holds only what the agent may spend.
3. Tools whose description says "Returns a secret" print a proxy password or a `pak_` key. Do not log their output.
4. Do not commit `.mcp.json` or any config file that carries a key.
5. The API never returns the exit IP of a dedicated port or pool session. `reserved_ip_list` shows the exit IP of a device you reserved; never publish it.

## Environment variables

| Variable | Purpose |
|---|---|
| `PROXIES_API_KEY` | API key mode. Format `psx_...` |
| `PROXIES_EMAIL`, `PROXIES_PASSWORD` | Alternative to the API key: account login |
| `AGENT_WALLET_KEY` | x402 mode: `0x` private key of a USDC wallet on Base |
| `BASE_RPC_URL` | x402 mode, optional: custom Base RPC |
| `PROXIES_API_URL` | Optional API base. Default `https://api.proxies.sx`; a trailing `/v1` is accepted |

## Links

- npm: <https://www.npmjs.com/package/@proxies-sx/mcp-server>
- Source: <https://github.com/bolivian-peru/proxies-sx-mcp-server>
- Dashboard page: <https://client.proxies.sx/mcp-server>
- Pool Gateway guide: <https://agents.proxies.sx/pool/skill.md>
- Master Proxies.sx skill: <https://agents.proxies.sx/skill.md>
