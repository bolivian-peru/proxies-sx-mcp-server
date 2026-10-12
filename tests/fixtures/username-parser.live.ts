/**
 * TEST FIXTURE: a verbatim copy of the Pool Gateway username parser that is
 * live on gw.proxies.sx (monorepo gateway/src/routing/username-parser.ts at
 * release f2e408aa, October 8, 2026). tests/pool-username.test.ts checks that
 * pool_build_proxy_url emits only what this parser reads back unchanged.
 * Replace the copy below this header when the gateway grammar changes.
 */
/**
 * Username Parser for Proxy Gateway
 *
 * Parses username tokens to extract routing configuration.
 * Format: account-pool-country[-city-X][-carrier-X][-rot-X][-sid-X][-pin-X-Y][-failover-X][-ttl-X]
 *
 * Examples:
 *   psx_abc123-peer-us                          → US peer device
 *   psx_abc123-peer-us-sid-bot01-rot-sticky     → Sticky session "bot01"
 *   psx_abc123-peer-us-carrier-tmobile-failover-samecarrier → T-Mobile with carrier failover
 */

export type PoolType = 'mbl' | 'peer' | 'any' | 'best';

export type RotationMode =
  | 'auto5'     // New IP every 5 min (soft rotate: pick different endpoint)
  | 'auto10'    // New IP every 10 min (default, soft rotate)
  | 'auto20'    // New IP every 20 min (soft rotate)
  | 'auto60'    // New IP every 60 min (soft rotate)
  | 'ondemand'  // New IP only on new connection (soft rotate)
  | 'sticky'    // Same IP for session duration
  | 'hard';     // Gateway behaviour: PINS like 'sticky' (same modem). A true
                // carrier-IP reset (ProxySmart airplane toggle) only happens via
                // the explicit /rotate action — NOT per-request — and is a no-op
                // for peers (residential SDKs don't expose it). So at routing time
                // `hard` ≡ `sticky`. It does NOT give "a new IP on every request".

export type FailoverPolicy =
  | 'any'           // Fastest available device
  | 'samecountry'   // Same country only (default)
  | 'samecarrier'   // Same carrier only
  | 'samenode'      // Same relay server
  | 'strict';       // Error if device unavailable

export interface PinConfig {
  // 'lease' is the Reserved-IP form: the id is a leaseId, which the gateway
  // resolves through the backend-owned `gw:lease:<leaseId>` -> endpointId
  // pointer. It exists because 'device' bakes a MUTABLE endpointId into a
  // credential the customer keeps — after a rotation that string silently
  // routes onto hardware the lease no longer reserves. 'device' stays
  // supported: credentials already in customers' hands use it.
  type: 'port' | 'device' | 'lease';
  id: string;
}

/**
 * The targeting predicates a request carried, for logs and NO_STOCK messages.
 * pool/country are logged separately; this is everything that can empty the
 * candidate set without being visible — the audit of 2026-09-01 found 19,522
 * refusals in five days whose cause (a hard -asn- on an ASN with zero listed
 * devices) never appeared in any log line.
 */
export function describeFilters(c: ParsedUsername): string {
  const parts: string[] = [];
  if (c.ipType) parts.push(`iptype=${c.ipType}`);
  if (c.asn) parts.push(`asn=${c.asn}`);
  if (c.isp) parts.push(`isp=${c.isp}`);
  if (c.carrier) parts.push(`carrier=${c.carrier}`);
  if (c.city) parts.push(`city=${c.city}`);
  if (c.state) parts.push(`state=${c.state}`);
  if (c.pin) parts.push(`pin=${c.pin.type}:${c.pin.id}`);
  return parts.join(' ');
}

export interface ParsedUsername {
  accountId: string;
  pool: PoolType;
  country: string;
  city?: string;
  /**
   * Region / US-state soft preference (`-state-il`, `-state-ny`). Matched
   * against the endpoint hash `region` field (ISO subdivision, normalized
   * lowercase alnum). Soft like city: prefers a matching endpoint, silently
   * falls back to any same-country endpoint when none is available.
   */
  state?: string;
  carrier?: string;
  /**
   * Granular targeting (May 2026): match peer ISP / ASN slug exactly.
   * Both compare case-insensitively against the endpoint hash's
   * `ispName` / `asn` field. ISP comparison is "slugified" — strip
   * non-alphanumeric, lowercase — so "Spectrum-Charter, Inc." matches
   * "spectrumcharterinc". Use the shorter brand slug in the username
   * (e.g., `-isp-spectrum`).
   *
   * Use case: scraping that needs to look like traffic from a specific
   * carrier's customers (Spectrum, Comcast, T-Mobile, AT&T) — e.g.,
   * ad verification at a granular geographic level.
   */
  isp?: string;
  asn?: number;
  /**
   * IP-type targeting (May 2026): restrict selection to a device class.
   * `mobile` = mobile-carrier IPs (Phonegate modems + mobile peers),
   * `residential` = home-ISP peers, `datacenter` = ISP (static): server-hosted
   * addresses on ISP-registered networks. Matched against the endpoint hash
   * `ipType` field. Empty = any class except ISP (static), which is served
   * only when named (default).
   * Token: `-iptype-mobile` / `-iptype-residential` / `-iptype-isp`.
   */
  ipType?: 'mobile' | 'residential' | 'datacenter';
  rotation: RotationMode;
  /**
   * Strict-sticky flag (#305, May 2026). Set by a bare `-strict` token,
   * which `-rot-sticky-strict` produces naturally (the DSL splits on '-',
   * so that phrase parses as rot=sticky + a trailing `strict` token).
   *
   * Only meaningful alongside `sticky`/`hard`: it makes the selector weight
   * `ipStabilityScore` much harder (0.7) AND apply a hard minimum-stability
   * floor, so the customer lands on the endpoint whose exit IP holds best.
   * Pair with the residential `peer` pool for the strongest IP-hold contract
   * (home-ISP IPs are stable for hours). A no-op for auto / ondemand modes.
   */
  strict?: boolean;
  sessionId?: string;
  pin?: PinConfig;
  failover: FailoverPolicy;
  ttl: number;  // seconds
  /** Auto-corrections applied by the self-healing parser (ops visibility; never shown to the customer). */
  corrections?: string[];
}

export interface ParseResult {
  success: boolean;
  data?: ParsedUsername;
  error?: string;
}

// Rotation mode interval mapping (in seconds)
export const ROTATION_INTERVALS: Record<RotationMode, number> = {
  auto5: 300,
  auto10: 600,
  auto20: 1200,
  auto60: 3600,
  ondemand: 0,
  sticky: 0,
  hard: 0,      // On-demand only, no auto-interval
};

/**
 * Parse a proxy username into routing configuration
 */
export function parseUsername(username: string): ParseResult {
  if (!username || typeof username !== 'string') {
    return { success: false, error: 'Username is required' };
  }

  if (username.length > 256) {
    return { success: false, error: 'Username too long' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SELF-HEALING PARSE (Jun 2026 — "route flawlessly, fix in background").
  //
  // Postel's Law: be liberal in what we accept. A proxy username is a
  // hand-built DSL string from arbitrary customer tooling — typos, aliases,
  // omitted tokens, and odd casing are inevitable. Rather than hard-error
  // (a 400/407 the customer sees as "broken proxy"), we SANITIZE, smart-ALIAS,
  // and DEFAULT every routing preference, then route. The only thing we truly
  // need is the account id (part[0]) for auth + billing; everything else has a
  // safe fallback. Each auto-correction is recorded in `corrections[]` and
  // logged once (so ops can proactively fix a customer's config) — but the
  // request always succeeds. This is the "system fixes it in the background,
  // customer never even aware" behavior.
  // ─────────────────────────────────────────────────────────────────────────
  const corrections: string[] = [];

  const POOL_ALIASES: Record<string, PoolType> = {
    mbl: 'mbl', mobile: 'mbl', modem: 'mbl', cell: 'mbl', cellular: 'mbl',
    lte: 'mbl', '4g': 'mbl', '5g': 'mbl', sim: 'mbl',
    peer: 'peer', residential: 'peer', resi: 'peer', res: 'peer', home: 'peer', household: 'peer',
    any: 'any', all: 'any', mixed: 'any',
    best: 'best', premium: 'best', fast: 'best', quality: 'best', top: 'best',
  };
  const COUNTRY_ALIASES: Record<string, string> = {
    usa: 'us', america: 'us', unitedstates: 'us', murica: 'us',
    uk: 'gb', gbr: 'gb', britain: 'gb', england: 'gb', unitedkingdom: 'gb',
    deu: 'de', ger: 'de', germany: 'de', deutschland: 'de',
    fra: 'fr', france: 'fr',
    esp: 'es', spain: 'es',
    pol: 'pl', poland: 'pl',
    nld: 'nl', netherlands: 'nl', holland: 'nl',
    geo: 'ge', georgia: 'ge',
    all: 'any', any: 'any',
  };
  const ROTATION_ALIASES: Record<string, RotationMode> = {
    auto5: 'auto5', auto10: 'auto10', auto20: 'auto20', auto60: 'auto60',
    ondemand: 'ondemand', sticky: 'sticky', hard: 'hard',
    auto: 'auto10', rotate: 'auto10', rotating: 'auto10', rotation: 'auto10',
    static: 'sticky', stick: 'sticky', pinned: 'sticky', pin: 'sticky',
    stable: 'sticky', fixed: 'sticky', persistent: 'sticky', keep: 'sticky',
  };
  const IPTYPE_ALIASES: Record<string, 'mobile' | 'residential' | 'datacenter'> = {
    mobile: 'mobile', mbl: 'mobile', cell: 'mobile', cellular: 'mobile',
    residential: 'residential', resi: 'residential', res: 'residential', home: 'residential',
    datacenter: 'datacenter', dc: 'datacenter', datac: 'datacenter', hosting: 'datacenter', server: 'datacenter',
    isp: 'datacenter',
  };
  const KNOWN_TOKENS = new Set([
    'city', 'state', 'carrier', 'iptype', 'isp', 'asn', 'rot', 'sid', 'pin', 'strict', 'failover', 'ttl',
  ]);
  // Snap an arbitrary auto<N> to the nearest supported interval (minutes).
  const snapAuto = (n: number): RotationMode => {
    const opts: [number, RotationMode][] = [[5, 'auto5'], [10, 'auto10'], [20, 'auto20'], [60, 'auto60']];
    let best = opts[1]; let d = Infinity;
    for (const o of opts) { const dd = Math.abs(o[0] - n); if (dd < d) { d = dd; best = o; } }
    return best[1];
  };
  const sanitizeToken = (v: string | undefined): string =>
    (v || '').replace(/[^a-z0-9_]/g, '').slice(0, 64);

  const parts = username.toLowerCase().split('-');

  // ── account (required; auth is the real gate — pass through, never block) ──
  const accountId = parts[0] || '';
  if (!accountId) {
    return { success: false, error: 'Username is required' };
  }

  // ── pool + country: positional but tolerant of omissions / aliases ──
  let idx = 1;
  let pool: PoolType = 'any';
  let country = 'any';

  if (idx < parts.length && !KNOWN_TOKENS.has(parts[idx])) {
    const cand = parts[idx];
    if (POOL_ALIASES[cand] !== undefined) {
      if (POOL_ALIASES[cand] !== cand) corrections.push(`pool '${cand}'→'${POOL_ALIASES[cand]}'`);
      pool = POOL_ALIASES[cand];
      idx++;
    } else if (/^[a-z]{2}$/.test(cand) || COUNTRY_ALIASES[cand] !== undefined) {
      // Looks like a country → the customer omitted the pool. Leave pool='any'
      // and let the country slot below consume this token.
      corrections.push(`pool omitted → 'any'`);
    } else {
      // Unrecognized pool word → default 'any', consume it.
      corrections.push(`pool '${cand}' unrecognized → 'any'`);
      idx++;
    }
  } else if (idx >= parts.length) {
    corrections.push(`pool omitted → 'any'`);
  }

  if (idx < parts.length && !KNOWN_TOKENS.has(parts[idx])) {
    const cand = parts[idx];
    if (/^[a-z]{2}$/.test(cand) || cand === 'any') {
      country = cand;
    } else if (COUNTRY_ALIASES[cand] !== undefined) {
      corrections.push(`country '${cand}'→'${COUNTRY_ALIASES[cand]}'`);
      country = COUNTRY_ALIASES[cand];
    } else {
      corrections.push(`country '${cand}' unrecognized → 'any'`);
      country = 'any';
    }
    idx++;
  } else {
    corrections.push(`country omitted → 'any'`);
  }

  const result: ParsedUsername = {
    accountId,
    pool,
    country: country.toUpperCase(),
    rotation: 'auto10',       // default
    failover: 'samecountry',  // default
    ttl: 3600,                // default 1 hour
  };

  // ── Optional tokens: each is sanitized / defaulted / skipped — never fatal ──
  let i = idx;
  while (i < parts.length) {
    const token = parts[i];
    const value = parts[i + 1];

    switch (token) {
      case 'city': {
        // Geo keys are strictly [a-z0-9] (normalizeGeoKey on the hash side).
        // sanitizeToken keeps '_' for sid/carrier slugs — a '_' here would parse
        // fine and then match nothing, forever. Strip it to the hash shape.
        const v = sanitizeToken(value).replace(/_/g, '');
        if (v) result.city = v;
        else corrections.push(`city token had no usable value → ignored`);
        i += 2;
        break;
      }

      case 'state': {
        const v = sanitizeToken(value).replace(/_/g, '');
        if (v) result.state = v;
        else corrections.push(`state token had no usable value → ignored`);
        i += 2;
        break;
      }

      case 'carrier': {
        const v = sanitizeToken(value);
        if (v) result.carrier = v;
        else corrections.push(`carrier token had no usable value → ignored`);
        i += 2;
        break;
      }

      case 'iptype': {
        const m = value ? IPTYPE_ALIASES[value] : undefined;
        if (m) {
          if (m !== value) corrections.push(`iptype '${value}'→'${m}'`);
          result.ipType = m;
        } else {
          corrections.push(`iptype '${value ?? ''}' unrecognized → no class filter`);
        }
        i += 2;
        break;
      }

      case 'isp': {
        const v = sanitizeToken(value);
        if (v) result.isp = v;
        else corrections.push(`isp token had no usable value → ignored`);
        i += 2;
        break;
      }

      case 'asn': {
        const digits = (value || '').replace(/\D/g, '').slice(0, 7);
        if (digits) result.asn = parseInt(digits, 10);
        else corrections.push(`asn '${value ?? ''}' non-numeric → ignored`);
        i += 2;
        break;
      }

      case 'rot': {
        let mode = value ? ROTATION_ALIASES[value] : undefined;
        if (!mode && value) {
          const am = value.match(/^auto(\d+)$/);
          if (am) { mode = snapAuto(parseInt(am[1], 10)); corrections.push(`rotation '${value}'→'${mode}'`); }
        }
        if (mode) {
          if (mode !== value) corrections.push(`rotation '${value}'→'${mode}'`);
          result.rotation = mode;
        } else {
          corrections.push(`rotation '${value ?? ''}' unrecognized → 'auto10'`);
        }
        i += 2;
        break;
      }

      case 'sid': {
        // Per-account namespaced — see the long note in the prior version.
        // Sanitize to charset + length instead of rejecting. If nothing usable
        // survives, drop the sid (connection still routes, just no stickiness).
        const v = sanitizeToken(value);
        if (v) result.sessionId = v;
        else corrections.push(`sid '${value ?? ''}' unusable → no session pin`);
        i += 2;
        break;
      }

      case 'pin': {
        // An unrecognised pin type is DROPPED silently (the self-healing
        // parser never 400s), so every type the backend can emit must appear
        // here or the pin vanishes and the request falls through to ordinary
        // shared selection — worse than no pin at all for a Reserved IP.
        const t =
          value === 'port' || value === 'device' || value === 'lease' ? value : null;
        const id = parts[i + 2];
        if (t && id) { result.pin = { type: t, id }; i += 3; }
        else { corrections.push(`pin token malformed → ignored`); i += t ? 2 : 1; }
        break;
      }

      case 'strict':
        result.strict = true;
        i += 1;
        break;

      case 'failover':
        if (value && isValidFailover(value)) result.failover = value as FailoverPolicy;
        else corrections.push(`failover '${value ?? ''}' unrecognized → 'samecountry'`);
        i += 2;
        break;

      case 'ttl': {
        const n = parseInt(value || '', 10);
        if (!isNaN(n)) {
          const clamped = Math.min(2_592_000, Math.max(60, n));
          if (clamped !== n) corrections.push(`ttl ${n}→${clamped} (clamped 60..2592000)`);
          result.ttl = clamped;
        } else {
          corrections.push(`ttl '${value ?? ''}' non-numeric → 3600`);
        }
        i += 2;
        break;
      }

      default:
        // Unknown token — skip one part (forward-compat).
        i++;
        break;
    }
  }

  if (corrections.length > 0) {
    result.corrections = corrections;
    // One concise line per healed connection — greppable for ops to spot a
    // customer with a consistently malformed config and reach out. The request
    // itself still routes; the customer sees nothing.
    // Sanitize before logging: the raw username (from Proxy-Authorization /
    // SOCKS5 userpass) and corrections embed attacker-controlled text — strip
    // CR/LF/control chars so a crafted username can't forge log lines pre-auth
    // (CWE-117, audit L-3).
    const clean = (s: string) => String(s).replace(/[\r\n\t\x00-\x1f\x7f]/g, '·').slice(0, 200);
    console.warn(`[PARSER-HEAL] acct=${clean(accountId)} → ${clean(corrections.join('; '))} | raw="${clean(username.slice(0, 140))}"`);
  }

  return { success: true, data: result };
}

/**
 * Namespace a customer-supplied `-sid-` by (pool, country) so each combination
 * is its OWN sticky pin (customer report 2026-06-03; regressed as #496).
 *
 * The session store keys on (accountId, sessionId) only, so without this fold
 * a sid first bound under one pool/country is silently reused when the same
 * sid arrives with different tokens — an `mbl-de` request handed back the
 * peer/SE endpoint the sid first pinned, ignoring both tokens. The fold lived
 * inline in proxy-server.ts only, so :7001 kept the bug for two months: it is
 * shared here precisely so the two listeners can never diverge again.
 *
 * Same sid + same pool/country = same pin (sticky as intended); same sid +
 * different pool/country = a fresh pin under that scope. No-op without a sid.
 */
export function scopeSessionId(config: ParsedUsername): ParsedUsername {
  if (!config.sessionId) return config;
  return { ...config, sessionId: `${config.pool}_${config.country}_${config.sessionId}` };
}

/**
 * True when a session's endpoint no longer sits in the country the username
 * demands (#496). A specific country is a CONTRACT, not a hint
 * (TKT-20260728-006) — but an endpoint's country can drift after the session
 * bound it (a peer's carrier NAT re-geolocates), and the reuse path never
 * re-checked it, so a `..._DE_...` pin kept serving SE. Callers drop the
 * session and re-select; with zero stock that surfaces E_NO_STOCK_COUNTRY.
 *
 * Never true for country `any` (cross-country is the ask), for a `-pin-`
 * (it names hardware, not geography — a Reserved IP's exit may move), for a
 * failover policy that permits cross-country replacement (`-failover-any`
 * explicitly, `samenode` implicitly — the failover handler constrains those to
 * relay node only, so the endpoint it legitimately assigned must not be
 * perpetually re-dropped here), or for an endpoint with no country recorded
 * (fail open: a missing hash field must not drop working sessions).
 */
export function countryMismatch(config: ParsedUsername, endpointCountry: string | undefined): boolean {
  if (config.pin || config.country === 'ANY' || !endpointCountry) return false;
  if (config.failover === 'any' || config.failover === 'samenode') return false;
  return endpointCountry.toUpperCase() !== config.country;
}

function isValidRotation(value: string): boolean {
  return ['auto5', 'auto10', 'auto20', 'auto60', 'ondemand', 'sticky', 'hard'].includes(value);
}

function isValidFailover(value: string): boolean {
  return ['any', 'samecountry', 'samecarrier', 'samenode', 'strict'].includes(value);
}

/**
 * Generate a username string from parsed config (reverse operation)
 */
export function generateUsername(config: ParsedUsername): string {
  const parts = [config.accountId, config.pool, config.country.toLowerCase()];

  if (config.city) {
    parts.push('city', config.city);
  }
  if (config.state) {
    parts.push('state', config.state);
  }

  if (config.carrier) {
    parts.push('carrier', config.carrier);
  }

  if (config.rotation !== 'auto10') {
    parts.push('rot', config.rotation);
  }

  if (config.strict) {
    // Emits `…-rot-sticky-strict` when rotation is sticky (or `…-strict`
    // standalone), round-tripping the bare flag token.
    parts.push('strict');
  }

  if (config.sessionId) {
    parts.push('sid', config.sessionId);
  }

  if (config.pin) {
    parts.push('pin', config.pin.type, config.pin.id);
  }

  if (config.failover !== 'samecountry') {
    parts.push('failover', config.failover);
  }

  if (config.ttl !== 3600) {
    parts.push('ttl', config.ttl.toString());
  }

  return parts.join('-');
}
