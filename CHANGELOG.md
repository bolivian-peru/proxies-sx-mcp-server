# Changelog

## Unreleased

- Claude Code plugin: `.claude-plugin/marketplace.json` and `plugin.json` make the repository a one-plugin marketplace (`/plugin marketplace add bolivian-peru/proxies-sx-mcp-server`, then `/plugin install proxies-sx@proxies-sx`). The plugin starts the pinned `npx -y @proxies-sx/mcp-server@3.1.0`, asks for `PROXIES_API_KEY` as a sensitive userConfig value, carries the directory icon and policy links, and loads `SKILL.md` as its skill. The npm package is unchanged.

## 3.1.0 (2026-10-28)

Private modems and card top-ups, and a default toolset of 20 tools.

### Breaking for clients that relied on seeing every tool
- With an API key the server now lists **20 tools by default**, grouped by workflow: buy (`proxies_modem_catalog`, `proxies_modem_quote`, `proxies_modem_buy`, `proxies_modem_renew`, `proxies_topup_checkout`, `proxies_topup_status`, `get_pricing`), use (`pool_get_stock`, `pool_get_my_credentials`, `pool_build_proxy_url`, `pool_explain_error`, `proxies_modem_mine`, `proxies_modem_rotate`) and manage (`get_account_summary`, `get_account_usage`, `pool_set_proxy_password`, `get_service_status`, `create_support_ticket`, `list_my_tickets`, `get_ticket`). Every other API-key tool (dedicated ports, Private Pools and Reserved IPs, crypto orders, coupons, `pak_` keys, x402 session management, ops) is listed with `--toolset=full` on the command line or `PROXIES_TOOLSET=full` in the environment: `npx -y @proxies-sx/mcp-server --toolset=full`. A client that calls a hidden tool gets "Unknown tool". Wallet mode is unchanged: the x402 tools and the public tools are always listed when `AGENT_WALLET_KEY` is set.

### Added
- **Private modems** (`proxies_modem_*`): one dedicated 4G/5G modem rented by the day, week or month with unlimited traffic, paid from the account balance. `proxies_modem_catalog` (plans, stock, price in USD), `proxies_modem_quote` (price of a plan or of a renewal), `proxies_modem_buy`, `proxies_modem_renew`, `proxies_modem_rotate`, `proxies_modem_mine` (rented modems with credentials, open and failed orders). Offer a Private modem first for any dedicated, unlimited, exclusive-device, p0f or OpenVPN request.
- **Card top-up** (`proxies_topup_checkout`, `proxies_topup_status`): the agent prepares a Stripe Checkout link that a person opens and pays; the tool then reports when the balance is credited.
- **Spending rules.** `proxies_modem_buy`, `proxies_modem_renew` and `proxies_topup_checkout` do nothing without `confirm: true`, which the agent sets only after the user agreed to the exact USD amount; buy and renew also need `expectedPriceUsd` from the quote, and the API refuses a stale price (`price_changed`). Buy and renew send an `Idempotency-Key` (a generated UUID, or the `idempotencyKey` argument) and return the key they used, so a retry with the same key never buys twice. These three tools carry `destructiveHint: true`; buy and renew also `idempotentHint: true`.
- **Structured results.** The eight new tools declare an `outputSchema` and return `structuredContent` next to the same data as text.
- **API error codes.** When the API answers with a `code` and a `fix` (for example `scope_missing`, `spend_cap_reached`, `price_changed`, `no_stock`, `insufficient_balance`, `recent_checkout`, `renewal_open`), the tool error keeps the code and uses the API's fix as its `What to do:` line.
- `server.json` lists `PROXIES_TOOLSET`, `PROXIES_EMAIL`, `PROXIES_PASSWORD`, `BASE_RPC_URL` and the `--toolset` argument; `tools.json` rows carry `default` (listed without a flag) and `structured` (has an outputSchema).
- Tests: default versus full tool lists, the confirm and `expectedPriceUsd` refusals, the `Idempotency-Key` header and its reuse, the top-up link and status, an API error body with `code` and `fix`, and a scan of every description, schema and shipped document for an unmasked IPv4 address or the name of the modem supplier.

### Notes
- The `modems:purchase` and `billing:topup` API-key scopes, and the API-key card top-up route, ship with a later API release. Until then `proxies_modem_buy` and `proxies_modem_renew` answer with the API's refusal and its fix, and `proxies_topup_checkout` says that card top-ups are not offered to keys yet and points to the dashboard. The catalog, quote, mine and rotate tools work today with any key.
- `purchase_shared_traffic` is unchanged: a customer key still cannot buy GB through the API.

## 3.0.1 (2026-10-19)

npm metadata only, no code change: package description and keywords, homepage `https://agents.proxies.sx/mcp/`, Glama badge in the README, `server.json` description and `websiteUrl`.

## 3.0.0 (2026-10-08)

The server is brought in line with the live API. The tools a customer key can use were exercised against production for this release; reseller-only, admin-only and paid paths were checked up to the API's refusal and are pinned by route tests. Before this release, 27 of the tools failed or printed wrong output with the default configuration. This release also carries the changes of 2.4.2, which was never published to npm.

### Breaking for callers that name these
- `get_pool_stock` (wallet mode) is now `pool_get_stock`; `x402_list_cities` and `x402_list_carriers` are gone (see Removed). A client that discovers tools with `tools/list` is not affected; a prompt or script that calls one of these three by name gets "Unknown tool".
- `pool_build_proxy_url` without `pool` now builds `any` (the gateway chooses), not `mbl`.
- `PREFERRED_NETWORK` is ignored. Arguments that were removed (`tier`, `type`, `isPrivate`, the `list_ports` filters) are ignored when sent, not refused.

### Added
- **Pool Gateway:** `pool_get_facets` (cities, states, carriers and IP classes with stock in a country), `pool_explain_error` (what a gateway error code means and what to do), `pool_close_all_sessions`. `pool_get_stock` takes an optional `country` and shows the per-class counts. Stock, facets, the URL builder, the error explainer and `get_service_status` need no account and are also listed in wallet mode.
- **ISP (static) class:** `pool_build_proxy_url` accepts `ipType: "isp"` (`datacenter` is accepted as another name) and emits `-iptype-isp`. The class is served only when named. The builder also takes `state`, `isp`, `asn`, `strict`, `failover` and `ttl`.
- **Private Pool and Reserved IPs:** `private_pool_list`, `private_pool_build`, `private_pool_reveal`, `private_pool_usage`, `reserved_ip_list`, `reserved_ip_reserve`, `reserved_ip_rotate`, `reserved_ip_extend`, `reserved_ip_set_rotation`, `reserved_ip_release`.
- **Billing:** `coupon_validate`, `coupon_redeem`, `get_payment_history`; `purchase_shared_traffic` takes an optional `couponCode`.
- **Dedicated ports:** `extend_port`. `list_available_countries` takes a `countryId` and then lists the carriers and cities there with their ids.
- `get_service_status`: open incidents, component state and uptime.
- **Actionable errors.** A failing tool now always returns `isError: true`. For a missing or revoked key (401), a missing scope (403), an unknown route, a rate limit (429) and server errors the text ends with a `What to do:` line, and keys and passwords are masked in it.
- `tools.json`: the tool catalogue in machine-readable form, generated with `manifest.json` by `npm run build:manifest` and shipped in the package. The same script writes the tool lists inside `README.md`, `SKILL.md` and `llm.txt`.
- MCP annotations on the wallet (x402) tools; the tools that read or pay on-chain carry `openWorldHint: true`. (From 2.4.2: annotations on every API-key tool, `manifest.json`, `Dockerfile`, registry section in the README.)
- Tests: every tool has a handler, a zod schema, annotations and a valid JSON Schema; the method, path, body and headers of every API tool; the username builder against a copy of the live gateway parser; the error mapping. `tests/live-smoke.mjs` calls every read-only tool against production.

### Changed
- `PROXIES_API_URL` is accepted with or without a trailing `/v1`. The documented value `https://api.proxies.sx/v1` used to make every API-key tool call `/v1/v1/...`.
- `pool_build_proxy_url`: the secret argument is `password` (`pakKey` still works); the pool defaults to `any`; values are reduced to what the gateway keeps (a `-` in a `sid` used to cut the token); it refuses the `mbl` pool outside US, GB, FR, NL, PL and GE (Georgia) and warns when `sticky`, `hard` or `auto*` has no `sid`; SOCKS5 URLs use `socks5h://`.
- `pool_get_my_credentials` returns the real proxy password, not a placeholder.
- `get_account_usage` shows Pool Gateway and dedicated-port traffic separately and no longer prints a price; `get_pricing` is the place for prices.
- `rotate_port` and `reconfigure_port` print the port's new connection strings; `reconfigure_port` says that the port ID changes.
- `get_port_ip` returns the server address and says that the API does not return the exit IP.
- The dedicated-port tools refuse a `portId` that is not a 24-character ID before calling the API and point to `list_ports`; a port name used to end in a server error.
- The Private Pool and Reserved IP tools say that connection strings come back with `pak_********` as the password and that `private_pool_reveal` gives the key to put in its place.
- Ticket categories and priorities are the ones the API accepts (`general`, `feature_request`, `port_issue`, `port_addition_request`; priority `urgent`).
- `x402_get_pool_access` offers the `peer` and `mbl` tiers; `x402_get_pricing` and `x402_pool_pricing` read live prices. Wallet tools no longer carry prices in their descriptions.
- Tool descriptions no longer state prices or country counts.
- `create_crypto_payment`, `cancel_crypto_payment` and `purchase_shared_traffic` say that they need a reseller or admin key (`billing:write`); a customer key cannot hold that scope.

### Removed
- `x402_list_cities` and `x402_list_carriers`: the routes they called do not exist and the API has no public list of those values.
- `get_pool_stock` (wallet mode): `pool_get_stock` is listed in every mode instead.
- The `tier` argument of `x402_get_proxy` and `x402_get_pricing`, and the `type`/`isPrivate` arguments of `create_port`, `list_ports` and `list_available_countries`: private ports are retired and the API accepts the shared tier only.
- `list_ports` filters the API ignored (`type`, `countryId`, `carrierId`). `status` and `limit` remain.
- `PREFERRED_NETWORK`: the agent wallet pays on Base only, so the setting never worked for Solana.
- Unused API methods and types that pointed at routes which no longer exist, and the hand-run scripts in `tests/`.
- Farmer payout rates from the README.

### Fixed
- Support tickets: all five tools called `/tickets` without `/v1` (404).
- x402 session tools: all eight called `/x402/...` without `/v1` (404); `replace_x402_port` and `topup_x402_session` sent the session token and payment signature in the URL instead of headers.
- `reconfigure_port` (now `POST`), `configure_auto_rotation` (now `PATCH`), `speed_test_port` (now `/test-speed`): wrong method or path (404).
- The public rotation link of a port lacked `/v1`.
- `get_port_status` always said OFFLINE; `get_rotation_history` was always empty; `rotate_port` printed "undefined"; `get_account_summary` printed "[object Object]" and "null days remaining"; `purchase_shared_traffic` printed a total of $0.00; `list_ports` showed no country or carrier.
- `x402_list_countries` called a route that does not exist.
- x402 purchases (`x402_get_proxy`, `x402_get_pool_access`, `x402_pool_topup`): the 402 answer was read from the wrong place and the payment proof was sent in a header the API does not read; requests went to a path without `/v1`. Verified up to the payment step with an unfunded wallet; a paid purchase was not run for this release.
- `list_available_countries` asks for dedicated-port countries only (first published in this release; 2.4.1 printed every country with "0 devices").
- `server.json` and the docs pointed at `client.proxies.sx/api-keys`; keys are created at `client.proxies.sx/account`.

### Security
- The x402 session cache in `~/.proxies-sx/` holds proxy passwords and `x402s_` session tokens. Its files are now written readable by the owner only (mode 600); they used to get the default mode.
- A tool error masks the exact API key, login password and wallet key the server was started with, whatever their shape.
- An id argument that contains `?`, `#`, a backslash or a `.`/`..` path segment is refused before any request, so it cannot steer a call to another API route.
- When a request fails after an on-chain USDC payment was sent (`x402_get_proxy`, `x402_get_pool_access`, `x402_pool_topup`), the error names the transaction hash. Before, the hash was lost with the failure.
- `reconfigure_port` is annotated destructive: it removes the old port ID, login and port numbers.

## 2.4.1 (2026-07-25)

Doc/example correctness pass on top of 2.4.0 — no tool surface changes, no version-number-worthy behavior changes to already-shipped code. Tool count unchanged at 89 (70 api-key + 19 x402).

### Fixed
- Corrected stale dedicated-port country claims (README, llm.txt) from `DE, PL, US, FR, ES, GB` to the real, live set: `US, GB, FR, NL, PL, GE` (Georgia — not Germany, not Spain). Verified against `GET /v1/x402/countries` on the production backend; this is also the exact 6-country set behind the Pool Gateway `mbl` tier.
- Replaced "Create a shared proxy in Germany" examples (README, llm.txt) and the `-mbl-de` DSL example (README, and the `x402_get_pool_access` tool description + purchase-confirmation message in source) — Germany has zero device stock on this backend. Examples now use Poland/`-mbl-pl`, which is real, live stock.
- Fixed a wrong GitHub URL in `llm.txt` (`github.com/proxies-sx/mcp-server` → `github.com/bolivian-peru/proxies-sx-mcp-server`).
- `llm.txt` tool catalog was still showing the pre-2.3.0 count (79 tools, 7-tool Pool Gateway section) and was missing `x402_pool_usage`. Brought back in sync with README/CLAUDE.md: 89 tools total, 16-tool Pool Gateway section, 8-tool wallet-side x402 pool section.
- Restored `SKILL.md` (present on npm/GitHub history but missing from the monorepo source since before 2.0.0) and brought its tool counts/examples/countries up to date — it was still describing the 61-tool/44/17 era.

## 2.4.0 (2026-07-24)

_Published to npm 2026-07-24T19:59:49Z. This entry documents what actually shipped in that release; the GitHub source repo had not been synced past 2.2.0 until the 2.4.1 pass above caught it up._

### Added
- **`ipType` hard-filter on `pool_build_proxy_url`.** New optional `ipType` param (`mobile`/`residential`/`datacenter`) emits the gateway's existing `-iptype-<value>` DSL token, hard-filtering the `peer` pool to a single exit class. `mbl` is mobile-only by construction, so this only matters for `peer`/`any`/`best`. This is a client-side DSL-builder update — the gateway already enforced `-iptype-` server-side, no new backend surface was added.
- `pool_build_proxy_url` `rotation` enum expanded to the gateway's real rotation modes: `sticky`, `hard`, `auto5`, `auto10`, `auto20`, `auto60`, `ondemand` (was `sticky`/`rotate` — `rotate` was never a real gateway value).
- `pool_build_proxy_url` `pool` enum expanded to `mbl`/`peer`/`any`/`best` (was `mbl`/`peer` only).
- `pool_build_proxy_url` `sid` description now reflects the self-healing gateway parser: 1–64 chars (no more artificial 8-char minimum), and calls out that a `sid` is required for sticky/auto rotation to persist across connections.

## 2.3.0 (2026-07-24)

### Added
- **Coverage-gap fill: 9 API-key pool tools.** Self-service: `pool_get_my_credentials` (`GET /v1/gateway/credentials`), `pool_get_my_stats` (`GET /v1/gateway/pool/my-stats`), `pool_set_proxy_password` (`PATCH /v1/account/proxy-password`). Reseller pool-access-key management: `pool_update_key` (`PATCH /v1/reseller/pool-keys/:id`), `pool_regenerate_key` (`POST .../regenerate`), `pool_reveal_key` (`POST .../reveal`, audit-logged), `pool_delete_key` (`DELETE`), `pool_key_usage` (`GET .../usage`), `pool_key_audit` (`GET .../audit`).
- **`x402_pool_usage` (wallet-side x402 pool group):** `GET /v1/x402/manage/pool/usage` — per-day MB series for a pool session (default 30d, max 365d). The API client method (`X402Client.getPoolUsage`) already existed; this wires it to a tool.

### Notes
- Total tools: 79 -> **89** (70 api-key + 19 x402).

## 2.2.0 (2026-07-02)

### Fixed
- **`x402_extend_session` now works.** It previously called `POST /x402/sessions/:id/extend`, a route that does not exist on the backend, so every extend attempt in 2.1.0 (and earlier) failed. It now uses the real route: `POST /v1/x402/manage/session/topup` with the `X-Session-Token` header and `{ addDurationSeconds }`. Duration-only top-ups are FREE on the backend, so the tool no longer sends any USDC. The public input schema is unchanged (`session_id`, `additional_hours`); `session_id` also accepts the `x402s_` session token from the purchase response directly.
- Session cache now stores the manage session token (`x402s_...`) from purchase responses so follow-up manage calls work without re-entering it.

### Added
- **x402 Pool Gateway tool group (7, wallet-side):** `x402_get_pool_access`, `x402_pool_credit`, `x402_pool_topup`, `x402_pool_regenerate`, `x402_pool_connection`, `x402_pool_pricing`, `get_pool_stock`. A wallet-only agent can buy Pool Gateway access with USDC (Base or Solana) and get ONE credential that reaches every country in its tier via the username DSL (v1 tier `mbl`, $4/GB metered, HTTP :7000). All endpoints validated against the live backend (`/v1/x402/pool*`, `/v1/x402/manage/pool/*`, `/v1/gateway/pool/stock`).
- Pool session token is cached locally (`~/.proxies-sx/x402-pool-token.json`) so the manage tools work without passing the token each call.

### Changed
- `check:sync` is now tolerant when run outside the monorepo (standalone GitHub clones): it skips gracefully with a message when `../agents-landing` is not present, and still runs the strict check inside the monorepo.

### Notes
- Total tools: 72 -> **79** (61 api-key + 18 x402).

## 2.1.0 (2026-05-26)

### Added
- **Pool Gateway tool group (7):** `pool_get_stock`, `pool_build_proxy_url` (in-tool DSL builder — no SDK import), `pool_list_sessions`, `pool_close_session`, `pool_mint_key`, `pool_list_keys`, `pool_topup_key`. Makes the flagship one-port product agent-native.
- **Ops agent tool group (11):** `ops_get_user`, `ops_get_user_audit`, `ops_reconcile_payments`, `ops_list_tickets`, `ops_reply_ticket`, `ops_set_slots`, `ops_credit_balance`, `ops_email_user`, `ops_list_farmers`, `ops_get_farmer`, `ops_write_farmer_note`. Scoped (`ops:*`), capped, audited. Requires an admin-minted ops key.
- `check:sync` script + CI guard validating the tool count against `docs-manifest.json`.

### Notes
- Total tools: 55 → **72** (61 api-key + 11 x402).

## 2.0.0 (2026-02-08)

### Breaking
- **Tier names changed:** `dedicated` and `premium` removed. Use `shared` only
- **Pricing model updated:** Duration is now FREE. You only pay for traffic:
  - Shared: $4.00/GB
  - Was: $0.03/hr+$3.50/GB (shared), $0.10/hr+$3.00/GB (dedicated), $0.25/hr+$2.50/GB (premium)
- `x402_get_pricing` no longer accepts `duration_hours` parameter (duration is free)

### Fixed
- 3 missing tool handlers wired: `replace_x402_port`, `calculate_x402_topup`, `topup_x402_session`
- All pricing strings across tools and handlers now match the live backend
- `x402_get_proxy` cost estimate now matches actual 402 response

### Added
- Structured JSON error responses with `retryable` flag and `suggestion` field
- Framework recipes: LangChain, CrewAI, raw MCP examples
- CHANGELOG.md

---

## 1.0.2 (2026-02-04)

### Added
- x402 session management tools (8 tools): get_x402_session, list_x402_ports, get_x402_port_status, get_sessions_by_wallet, get_session_status, replace_x402_port, calculate_x402_topup, topup_x402_session
- Support tools (5 tools): create_support_ticket, list_my_tickets, get_ticket, reply_to_ticket, close_ticket

---

## 1.0.1 (2026-01-28)

### Fixed
- Billing tools updated for GB-only model (ports are free)
- Reference tools: removed cities, carriers, regions (simplified to countries only)

---

## 1.0.0 (2026-01-15)

### Initial Release
- 55 MCP tools across 10 categories
- API Key mode (48 tools) + x402 mode (11 tools)
- Port management, rotation, billing, reference data
- USDC payments on Base blockchain
- npm package: `@proxies-sx/mcp-server`
