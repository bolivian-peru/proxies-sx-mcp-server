# Changelog

## 2.1.0 (2026-06-12)

### Added — x402 Pool Gateway Access (the new product)
Wallet-only agents can now buy **Pool Gateway access** with USDC, not just a single dedicated port. One credential reaches **every country in your tier** via the username DSL (`psx_xxx-mbl-us`, `-mbl-de`, …). v1 tier = `mbl` ($4/GB, metered, production ProxySmart modems), HTTP proxy on port 7000.

Seven new tools (all in x402 autonomous mode):
- `x402_get_pool_access` — buy pool access with USDC (402 → pay → retry), caches the returned session token
- `x402_pool_credit` — remaining GB for a pool session (cached token if omitted)
- `x402_pool_topup` — pay USDC for more GB (duration-only is free)
- `x402_pool_regenerate` — rotate the credential secret (same username, new pak password)
- `x402_pool_connection` — re-emit credentials (recovery)
- `x402_pool_pricing` — tier catalog (no auth, no wallet)
- `get_pool_stock` — public online endpoint counts per country (no IPs)

### Fixed
- **`x402_extend_session` removed.** It called `POST /x402/sessions/:id/extend`, which does not exist. The existing `topup_x402_session` already correctly hits the real route (`POST /x402/manage/session/topup` with `X-Session-Token` + `Payment-Signature`), so the broken duplicate was deleted (definition + zod + handler + client `extendSession` method).
- Pool client methods correctly prefix `/v1` even when the MCP server is constructed with the bare `https://api.proxies.sx` base URL.

### Changed — pricing corrected to metered-only
- The platform is **per-GB metered only at $4/GB**; the legacy `$8/GB` private/dedicated tier was removed. Corrected every stale `$8` / private pricing claim in tool descriptions, schemas (`tier` enum is now `shared` only for x402 proxy tools), the pricing-display handler, billing tool descriptions, and all docs (README, SKILL.md, llm.txt, CLAUDE.md). `calculate_price` / `purchase_private_traffic` keep working (the API still accepts `isPrivate`), but are documented honestly — price is computed server-side.

### Tooling
- Tool count: **61** (44 API-key + 17 x402 autonomous). Was 55.

## 2.0.1 (2026-04-30)

### Docs
- Added `SKILL.md` in [Anthropic skill format](https://github.com/anthropics/skills) — drops directly into Claude Code, Cursor, Windsurf, etc. as a triggerable skill that produces correct setup configs and tool selection for any user intent
- README: removed specific peer rate dollar amounts (rates are platform-configurable, fetch live values from `get_pricing` / `x402_get_pricing` tools)
- GitHub repo metadata set: description, homepage, topics


## 2.0.0 (2026-02-08)

### Breaking
- **Tier names changed:** `dedicated` and `premium` removed. Use `shared` or `private` only
- **Pricing model updated:** Duration is now FREE. You only pay for traffic:
  - Shared: $4.00/GB
  - Private: $8.00/GB (exclusive device)
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
