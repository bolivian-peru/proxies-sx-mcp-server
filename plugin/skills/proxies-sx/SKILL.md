---
name: proxies-sx
description: Use the Proxies.sx MCP tools to get working residential or mobile proxy URLs, pick a pool and country, keep a sticky session, rotate IPs and explain gateway errors. Use when the user asks for a proxy, an exit in a country, IP rotation, or why a proxy request failed.
---

# Proxies.sx proxies

The `proxies-sx` MCP server is the hosted Proxies.sx server. Without an API key it lists five public tools: `pool_get_stock`, `pool_get_facets`, `pool_build_proxy_url`, `pool_explain_error` and `get_service_status`. With a key it also lists the account tools (credentials, usage, billing, rotation, Private modems, support).

## Get a proxy URL

1. Call `pool_get_stock` (optionally with a country) to see which pool has endpoints there.
2. With a key, call `pool_get_my_credentials` for the bare proxy username and password.
3. Call `pool_build_proxy_url` with pool, country and any filters. Use the URL it returns as is.

The gateway is `gw.proxies.sx`, port 7000 for HTTP and 7001 for SOCKS5. Routing lives in the username: `<username>-<pool>-<country>[-<token> <value> ...]`.

## Pools

- `peer`: the main pool, residential and mobile devices in many countries.
- `mbl`: carrier modems in US, GB, FR, NL, PL and GE. GE is Georgia, not Germany; for Germany use `peer` with country `de`.
- `any` and `best` let the gateway choose.

## Sessions and rotation

- `sticky` and the `auto5`, `auto10`, `auto20`, `auto60` modes need a `sid` token. Without one each connection gets a new session.
- The token is `sid`, not `session`. Unknown tokens are skipped silently.
- `hard` pins like `sticky`; it does not give a new IP per request.
- Sticky on a mobile modem pins the modem, not the IP: the carrier can still change the exit address. For a held address use a residential `peer` endpoint.

## Errors

Pass the gateway's error text to `pool_explain_error`. Common codes:

- `E_AUTH_REQUIRED`, `E_AUTH_INVALID`: missing or wrong proxy credentials.
- `E_BALANCE_EXHAUSTED`: the credentials are fine, the account has no traffic left.
- `E_NO_STOCK_COUNTRY`: no endpoint matches that pool, country and filters right now; check `pool_get_stock` and relax the filters.
- `E_SESSION_LIMIT`, `E_RATE_LIMITED_CONN`: too many sessions or connections; close idle sessions.

## Account and prices

Keys are created at https://client.proxies.sx/account. Current prices are published at https://api.proxies.sx/v1/pricing. Do not quote prices from memory.
