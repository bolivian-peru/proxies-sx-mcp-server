# Changelog

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
