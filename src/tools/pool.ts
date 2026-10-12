/**
 * Pool Gateway Tools
 * The main product: one endpoint (gw.proxies.sx, HTTP 7000 / SOCKS5 7001),
 * metered per GB, routing chosen inside the proxy username.
 *
 * - Stock, facets and the URL builder need no account and are registered in
 *   every mode (see PUBLIC_TOOL_NAMES in ./index.ts).
 * - pool_get_my_* / pool_set_proxy_password / session tools serve one account.
 * - The pak_ key tools need a reseller-role key (scopes customers:read/write).
 */

import { z } from 'zod';
import type { ProxiesApi } from '../api/index.js';
import { GATEWAY_ERRORS } from '../utils/errors.js';
import { readOnly, mutating, destructive } from './annotations.js';

const GATEWAY_HOST = 'gw.proxies.sx';
const GATEWAY_PORTS = { http: 7000, socks5: 7001 } as const;
/** Carrier modems exist in exactly these countries; GE is Georgia. */
const MBL_COUNTRIES = ['us', 'gb', 'fr', 'nl', 'pl', 'ge'];

const POOLS = ['mbl', 'peer', 'any', 'best'] as const;
const ROTATIONS = ['auto5', 'auto10', 'auto20', 'auto60', 'ondemand', 'sticky', 'hard'] as const;
export const FAILOVERS = ['any', 'samecountry', 'samecarrier', 'samenode', 'strict'] as const;
const IP_TYPES = ['mobile', 'residential', 'isp', 'datacenter'] as const;
const PROTOCOLS = ['http', 'socks5'] as const;
export const QUALITY_TIERS = ['safe', 'standard'] as const;
const NEEDS_SID = /^(sticky|hard|auto\d+)$/;

export interface PoolUrlOptions {
  pool?: (typeof POOLS)[number];
  country?: string;
  city?: string;
  state?: string;
  carrier?: string;
  isp?: string;
  asn?: number;
  ipType?: (typeof IP_TYPES)[number];
  sid?: string;
  rotation?: (typeof ROTATIONS)[number];
  strict?: boolean;
  failover?: (typeof FAILOVERS)[number];
  ttl?: number;
}

/**
 * Reduce a token value to what the gateway keeps: lowercase [a-z0-9_], at most
 * 64 characters. The gateway splits the username on '-', so a value that kept
 * a '-' would be cut there without any error.
 */
function tokenValue(name: string, value: string, allowUnderscore = true): string {
  const kept = value.toLowerCase().replace(allowUnderscore ? /[^a-z0-9_]/g : /[^a-z0-9]/g, '').slice(0, 64);
  if (!kept) throw new Error(`${name} "${value}" has no usable characters. Use lowercase letters and digits.`);
  return kept;
}

/**
 * Build the Pool Gateway proxy username. No network. The result contains only
 * what the gateway parser reads back unchanged (see tests/pool-username.test.ts).
 */
export function buildPoolUsername(proxyUsername: string, opts: PoolUrlOptions = {}): { username: string; warnings: string[] } {
  if (!/^[A-Za-z0-9_]+$/.test(proxyUsername)) {
    throw new Error('proxyUsername must be the bare account username (for example psx_abc123) without routing tokens.');
  }

  const pool = opts.pool ?? 'any';
  const country = (opts.country ?? 'any').toLowerCase();
  if (country !== 'any' && !/^[a-z]{2}$/.test(country)) {
    throw new Error(`country "${opts.country}" must be a 2-letter ISO code such as us or de, or "any".`);
  }
  if (pool === 'mbl' && country !== 'any' && !MBL_COUNTRIES.includes(country)) {
    throw new Error(
      `The mbl pool (carrier modems) exists only in US, GB, FR, NL, PL and GE (Georgia), so mbl-${country} never has stock. Use pool "peer" for ${country.toUpperCase()}.`,
    );
  }

  const warnings: string[] = [];
  const tokens: string[] = [pool, country];
  if (opts.city) tokens.push('city', tokenValue('city', opts.city, false));
  if (opts.state) tokens.push('state', tokenValue('state', opts.state, false));
  if (opts.carrier) tokens.push('carrier', tokenValue('carrier', opts.carrier));
  if (opts.ipType) {
    // 'datacenter' is the internal name of the ISP (static) class.
    const ipType = opts.ipType === 'datacenter' ? 'isp' : opts.ipType;
    tokens.push('iptype', ipType);
    if (pool === 'mbl' && ipType !== 'mobile') warnings.push(`The mbl pool is mobile only: iptype ${ipType} will find no stock there. Use pool "peer" or "any".`);
  }
  if (opts.isp) tokens.push('isp', tokenValue('isp', opts.isp));
  if (opts.asn) tokens.push('asn', String(opts.asn));
  if (opts.sid) tokens.push('sid', tokenValue('sid', opts.sid));
  if (opts.rotation) tokens.push('rot', opts.rotation);
  if (opts.strict) tokens.push('strict');
  if (opts.failover) tokens.push('failover', opts.failover);
  if (opts.ttl) tokens.push('ttl', String(opts.ttl));

  if (opts.rotation && NEEDS_SID.test(opts.rotation) && !opts.sid) {
    warnings.push(`rotation "${opts.rotation}" has no sid: every new connection starts a fresh session, so nothing is held across connections. Add a sid.`);
  }
  if (opts.strict && opts.rotation !== 'sticky' && opts.rotation !== 'hard') {
    warnings.push('strict only has an effect together with rotation sticky or hard.');
  }

  const username = `${proxyUsername}-${tokens.join('-')}`;
  if (username.length > 256) throw new Error('The proxy username is longer than 256 characters. Shorten the sid or drop filters.');
  return { username, warnings };
}

/** Full proxy URL for the gateway. SOCKS5 uses socks5h so the gateway resolves DNS. */
export function gatewayUrl(protocol: (typeof PROTOCOLS)[number], username: string, password: string): string {
  const scheme = protocol === 'socks5' ? 'socks5h' : 'http';
  return `${scheme}://${username}:${encodeURIComponent(password)}@${GATEWAY_HOST}:${GATEWAY_PORTS[protocol]}`;
}

interface PoolStock {
  pools: { mbl: Record<string, number>; peer: Record<string, number> };
  totals: { mbl: number; peer: number; all: number };
  ipTypes?: {
    peer?: Record<string, PeerClasses>;
    totals?: PeerClasses;
  };
  generatedAt?: string;
  stale?: boolean;
}

interface PeerClasses {
  mobile: number;
  residential: number;
  datacenter: number;
  unclassified: number;
}

interface PoolMyStats {
  myTrafficInMB: number;
  myTrafficOutMB: number;
  myTotalGB: number;
  myActiveConnections: number;
  poolOnlineDevices: number;
  poolHealthScore: number;
}

/** Show the peer classes under their customer names: datacenter is ISP (static). */
function peerClasses(c?: PeerClasses) {
  if (!c) return undefined;
  return { mobile: c.mobile, residential: c.residential, isp: c.datacenter, unclassified: c.unclassified };
}

const STOCK_NOTE = 'Counts are endpoints listed for sale right now and change by the minute. The peer figure does not include the isp (static) class, which is counted separately and served only when requested with ipType "isp". No exit IP is ever returned.';

const sessionScope = {
  pakId: { type: 'string', description: 'Reseller only: the pak_ key value of one customer, to see only that key\'s sessions' },
};
const keyId = { type: 'string', description: 'Key id from pool_list_keys' };

export const poolToolDefinitions = [
  {
    name: 'pool_get_stock',
    annotations: readOnly('Pool: Get Stock'),
    description: 'Get live Pool Gateway stock, no account needed. With a country: the mbl and peer endpoint counts there and the peer counts per class (mobile, residential, isp). Without: totals plus the count per country for both pools. Use it to pick a pool and country before pool_build_proxy_url.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        country: { type: 'string', description: '2-letter ISO country code, for example us or de' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'pool_get_facets',
    annotations: readOnly('Pool: Get Targeting Options'),
    description: 'List the cities, states, carriers (with ASN and class) and IP classes that have stock in one country, with counts, no account needed. The values are the ones pool_build_proxy_url accepts for city, state, carrier and asn. Pass city, state or carrier to see what remains once that filter is applied.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        country: { type: 'string', description: '2-letter ISO country code' },
        pool: { type: 'string', enum: ['peer', 'mbl', 'all'], description: 'Which pool to look at (default: peer)' },
        city: { type: 'string', description: 'Narrow to one city' },
        state: { type: 'string', description: 'Narrow to one state or region' },
        carrier: { type: 'string', description: 'Narrow to one carrier' },
      },
      required: ['country'],
    },
  },
  {
    name: 'pool_build_proxy_url',
    annotations: readOnly('Pool: Build Proxy URL'),
    description: 'Build a ready-to-use Pool Gateway proxy URL (gw.proxies.sx, HTTP 7000 or SOCKS5 7001). Local, no network. Take proxyUsername and password from pool_get_my_credentials (a reseller passes a customer pak_ key as password). pool: "peer" is the main network (residential and mobile, most countries), "mbl" is carrier modems in US, GB, FR, NL, PL and GE (Georgia) only, "any" or "best" let the gateway choose. Rotation: sticky and hard both hold one device, auto5/auto10/auto20/auto60 move to another device on that interval, ondemand picks again on each new connection; sticky, hard and auto* only persist across connections with a sid. Sticky holds the device, not the IP: a mobile carrier can still change the exit IP. The result contains the password.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        proxyUsername: { type: 'string', description: 'Bare proxy username, for example psx_abc123' },
        password: { type: 'string', description: 'Proxy password, or a pak_ key' },
        pakKey: { type: 'string', description: 'Alias of password (a pak_ key)' },
        pool: { type: 'string', enum: POOLS, description: 'Pool (default: any)' },
        country: { type: 'string', description: '2-letter ISO country code, or "any" (default: any)' },
        ipType: { type: 'string', enum: IP_TYPES, description: 'Only use one IP class: mobile (cellular carriers), residential (home broadband) or isp (static addresses on ISP-registered networks, hosted on servers). The isp class is served only when named here. "datacenter" is accepted as another name for isp.' },
        carrier: { type: 'string', description: 'Carrier from pool_get_facets: the part of a carrier id before the |, for example tmobile' },
        city: { type: 'string', description: 'City from pool_get_facets (preferred, not guaranteed)' },
        state: { type: 'string', description: 'State or region code from pool_get_facets, for example ny (preferred, not guaranteed)' },
        isp: { type: 'string', description: 'ISP name to match, for example comcast' },
        asn: { type: 'number', minimum: 1, maximum: 9999999, description: 'Only use one network, by AS number' },
        sid: { type: 'string', description: 'Session id: 1-64 characters, lowercase letters, digits and _. Other characters are removed.' },
        rotation: { type: 'string', enum: ROTATIONS, description: 'Rotation mode (gateway default: auto10)' },
        strict: { type: 'boolean', description: 'With sticky or hard: prefer the devices whose exit IP holds longest' },
        failover: { type: 'string', enum: FAILOVERS, description: 'What may replace a device that goes offline (gateway default: samecountry)' },
        ttl: { type: 'number', minimum: 60, maximum: 2592000, description: 'Session lifetime in seconds (gateway default: 3600)' },
        protocol: { type: 'string', enum: PROTOCOLS, description: 'http (default) or socks5' },
      },
      required: ['proxyUsername'],
    },
  },
  {
    name: 'pool_explain_error',
    annotations: readOnly('Pool: Explain Gateway Error'),
    description: 'Explain a Pool Gateway error and say what to do about it. Pass the error text your HTTP client got from gw.proxies.sx (it looks like "E_NO_STOCK_COUNTRY: ... (req: ...)") or just the code. Covers E_AUTH_INVALID, E_BALANCE_EXHAUSTED, E_NO_STOCK_COUNTRY, the rate and session limits and the rest. Local, no network.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        error: { type: 'string', description: 'The error text or code from the gateway' },
      },
      required: ['error'],
    },
  },
  {
    name: 'pool_get_my_credentials',
    annotations: readOnly('Pool: Get My Credentials'),
    description: 'Get your Pool Gateway proxy username and proxy password with ready HTTP and SOCKS5 URLs. Returns a secret. The proxy password is separate from the account login password. Scope account:read.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
  {
    name: 'pool_set_proxy_password',
    annotations: mutating('Pool: Set Proxy Password', true),
    description: 'Set a new proxy password (at least 6 characters). The old one stops working on the gateway at once. Scope account:write.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        proxyPassword: { type: 'string', minLength: 6, description: 'New proxy password, at least 6 characters' },
      },
      required: ['proxyPassword'],
    },
  },
  {
    name: 'pool_get_my_stats',
    annotations: readOnly('Pool: Get My Stats'),
    description: 'Get your own Pool Gateway traffic and open connections, plus the health score of the pool and how many devices are connected to it. Scope ports:read.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
  {
    name: 'pool_list_sessions',
    annotations: readOnly('Pool: List Sessions'),
    description: 'List your saved Pool Gateway sessions: pool, country, carrier, rotation mode, bytes and last activity. These are routing records the gateway keeps for a sid, not open connections, and no exit IP is included. Scope ports:read.',
    inputSchema: { type: 'object' as const, properties: sessionScope, required: [] as string[] },
  },
  {
    name: 'pool_close_session',
    annotations: destructive('Pool: Close Session'),
    description: 'Close one Pool Gateway session by the sessionKey from pool_list_sessions. The next request with that sid starts on a new device. Scope ports:write.',
    inputSchema: {
      type: 'object' as const,
      properties: { sessionKey: { type: 'string', description: 'sessionKey from pool_list_sessions' }, ...sessionScope },
      required: ['sessionKey'],
    },
  },
  {
    name: 'pool_close_all_sessions',
    annotations: destructive('Pool: Close All Sessions'),
    description: 'Close every saved Pool Gateway session of the account. Use it to get under the limit of 250 sessions (gateway error E_SESSION_LIMIT). Scope ports:write.',
    inputSchema: { type: 'object' as const, properties: sessionScope, required: [] as string[] },
  },
] as const;

/** Pool Access Keys: a reseller account gives each of its customers one. */
export const poolKeyToolDefinitions = [
  {
    name: 'pool_mint_key',
    annotations: mutating('Pool: Mint Access Key'),
    description: 'Create a Pool Access Key (pak_) for one of your customers; it is used as the proxy password. Reseller-role key with scope customers:write.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        label: { type: 'string', description: 'Label, 1-256 characters, for example customer:alice' },
        trafficCapGB: { type: 'number', description: 'Traffic cap in GB (1-100000); null for no cap within your own balance' },
        expiresAt: { type: 'string', description: 'ISO date in the future; null for no expiry' },
        qualityTier: { type: 'string', enum: QUALITY_TIERS, description: 'safe = carrier modems only; standard = modems and peers' },
      },
      required: ['label'],
    },
  },
  {
    name: 'pool_list_keys',
    annotations: readOnly('Pool: List Access Keys'),
    description: 'List your Pool Access Keys with usage, cap and expiry; the key values are masked. Reseller-role key with scope customers:read.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
  {
    name: 'pool_topup_key',
    annotations: mutating('Pool: Top Up Access Key'),
    description: 'Add GB to a Pool Access Key\'s cap and/or extend its expiry in one step. Reseller-role key with scope customers:write.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        keyId,
        addTrafficGB: { type: 'number', minimum: 1, maximum: 100000, description: 'GB to add to the cap' },
        extendDays: { type: 'number', minimum: 1, maximum: 1825, description: 'Days to add to the expiry' },
      },
      required: ['keyId'],
    },
  },
  {
    name: 'pool_update_key',
    annotations: mutating('Pool: Update Access Key', true),
    description: 'Change a Pool Access Key\'s label, enabled flag, cap, expiry or quality tier. Pass trafficCapGB or expiresAt as null to clear it. To grow a cap or expiry use pool_topup_key. Reseller-role key with scope customers:write.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        keyId,
        label: { type: 'string', description: '1-256 characters' },
        enabled: { type: 'boolean', description: 'false suspends the key' },
        trafficCapGB: { type: 'number', description: '1-100000, or null to remove the cap' },
        expiresAt: { type: 'string', description: 'ISO date in the future, or null to remove the expiry' },
        qualityTier: { type: 'string', enum: QUALITY_TIERS },
      },
      required: ['keyId'],
    },
  },
  {
    name: 'pool_regenerate_key',
    annotations: destructive('Pool: Regenerate Access Key'),
    description: 'Replace the secret pak_ value of a Pool Access Key. The old value stops working at once; the key id stays. Returns a secret. Reseller-role key with scope customers:write.',
    inputSchema: { type: 'object' as const, properties: { keyId }, required: ['keyId'] },
  },
  {
    name: 'pool_reveal_key',
    annotations: mutating('Pool: Reveal Access Key'),
    description: 'Show the full pak_ value of a Pool Access Key. Returns a secret, and every call is written to the key\'s audit log. Reseller-role key with scope customers:read.',
    inputSchema: { type: 'object' as const, properties: { keyId }, required: ['keyId'] },
  },
  {
    name: 'pool_delete_key',
    annotations: destructive('Pool: Delete Access Key'),
    description: 'Delete a Pool Access Key. It stops working at once. Reseller-role key with scope customers:write.',
    inputSchema: { type: 'object' as const, properties: { keyId }, required: ['keyId'] },
  },
  {
    name: 'pool_key_usage',
    annotations: readOnly('Pool: Access Key Usage'),
    description: 'Get the traffic of one Pool Access Key per day, in MB. Reseller-role key with scope customers:read.',
    inputSchema: {
      type: 'object' as const,
      properties: { keyId, days: { type: 'number', minimum: 1, maximum: 365, description: 'Days of history (default: 30)' } },
      required: ['keyId'],
    },
  },
  {
    name: 'pool_key_audit',
    annotations: readOnly('Pool: Access Key Audit Log'),
    description: 'Get the audit log of one Pool Access Key, newest first: created, changed, topped up, regenerated, revealed, deleted, and gateway logins that worked or failed. Reseller-role key with scope customers:read.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        keyId,
        limit: { type: 'number', minimum: 1, description: 'Maximum number of events' },
        before: { type: 'string', description: 'ISO date: only events before this time' },
      },
      required: ['keyId'],
    },
  },
] as const;

const pakScope = z.object({ pakId: z.string().optional() });
const keyOnly = z.object({ keyId: z.string().min(1) });

export const poolSchemas = {
  pool_get_stock: z.object({ country: z.string().regex(/^[A-Za-z]{2}$/).optional() }),
  pool_get_facets: z.object({
    country: z.string().regex(/^[A-Za-z]{2}$/),
    pool: z.enum(['peer', 'mbl', 'all']).optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    carrier: z.string().optional(),
  }),
  pool_build_proxy_url: z.object({
    proxyUsername: z.string().min(1),
    password: z.string().min(1).optional(),
    pakKey: z.string().min(1).optional(),
    pool: z.enum(POOLS).optional(),
    country: z.string().optional(),
    ipType: z.enum(IP_TYPES).optional(),
    carrier: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    isp: z.string().optional(),
    asn: z.number().int().min(1).max(9999999).optional(),
    sid: z.string().optional(),
    rotation: z.enum(ROTATIONS).optional(),
    strict: z.boolean().optional(),
    failover: z.enum(FAILOVERS).optional(),
    ttl: z.number().int().min(60).max(2592000).optional(),
    protocol: z.enum(PROTOCOLS).optional(),
  }),
  pool_explain_error: z.object({ error: z.string().min(1) }),
  pool_get_my_credentials: z.object({}),
  pool_set_proxy_password: z.object({ proxyPassword: z.string().min(6) }),
  pool_get_my_stats: z.object({}),
  pool_list_sessions: pakScope,
  pool_close_session: pakScope.extend({ sessionKey: z.string().min(1) }),
  pool_close_all_sessions: pakScope,
  pool_mint_key: z.object({
    label: z.string().min(1).max(256),
    trafficCapGB: z.number().min(1).max(100000).nullable().optional(),
    expiresAt: z.string().nullable().optional(),
    qualityTier: z.enum(QUALITY_TIERS).optional(),
  }),
  pool_list_keys: z.object({}),
  pool_topup_key: keyOnly.extend({
    addTrafficGB: z.number().min(1).max(100000).optional(),
    extendDays: z.number().min(1).max(1825).optional(),
  }),
  pool_update_key: keyOnly.extend({
    label: z.string().min(1).max(256).optional(),
    enabled: z.boolean().optional(),
    trafficCapGB: z.number().min(1).max(100000).nullable().optional(),
    expiresAt: z.string().nullable().optional(),
    qualityTier: z.enum(QUALITY_TIERS).optional(),
  }),
  pool_regenerate_key: keyOnly,
  pool_reveal_key: keyOnly,
  pool_delete_key: keyOnly,
  pool_key_usage: keyOnly.extend({ days: z.number().min(1).max(365).optional() }),
  pool_key_audit: keyOnly.extend({ limit: z.number().min(1).optional(), before: z.string().optional() }),
};

type PoolArgs<K extends keyof typeof poolSchemas> = z.infer<(typeof poolSchemas)[K]>;

/** Handlers return the API answer as JSON; errors propagate to the server's single tool-error path. */
export function createPoolToolHandlers(api: ProxiesApi) {
  const out = (r: unknown) => JSON.stringify(r, null, 2);
  const keys = '/v1/reseller/pool-keys';
  const sessions = '/v1/gateway/pool/my-sessions';

  return {
    async pool_get_stock(a: PoolArgs<'pool_get_stock'>) {
      const stock = await api.client.get<PoolStock>('/v1/gateway/pool/stock');
      const freshness = { generatedAt: stock.generatedAt, stale: stock.stale, note: STOCK_NOTE };

      if (a.country) {
        const cc = a.country.toLowerCase();
        return out({
          country: cc.toUpperCase(),
          mbl: stock.pools.mbl[cc] ?? 0,
          peer: stock.pools.peer[cc] ?? 0,
          peerByClass: peerClasses(stock.ipTypes?.peer?.[cc]),
          ...freshness,
        });
      }

      return JSON.stringify({
        totals: stock.totals,
        peerByClass: peerClasses(stock.ipTypes?.totals),
        mbl: stock.pools.mbl,
        peer: stock.pools.peer,
        ...freshness,
      });
    },

    async pool_get_facets(a: PoolArgs<'pool_get_facets'>) {
      return JSON.stringify(await api.client.get('/v1/gateway/pool/stock/facets', { ...a, country: a.country.toUpperCase() }));
    },

    async pool_build_proxy_url(a: PoolArgs<'pool_build_proxy_url'>) {
      const { proxyUsername, password, pakKey, protocol = 'http', ...routing } = a;
      const secret = password ?? pakKey;
      if (!secret) throw new Error('password is required: the proxy password from pool_get_my_credentials, or a pak_ key.');

      const { username, warnings } = buildPoolUsername(proxyUsername, routing);
      return out({
        proxyUrl: gatewayUrl(protocol, username, secret),
        username,
        host: GATEWAY_HOST,
        port: GATEWAY_PORTS[protocol],
        warnings,
        note: 'The URL contains the password: do not log or share it.',
      });
    },

    async pool_explain_error(a: PoolArgs<'pool_explain_error'>) {
      const code = a.error.toUpperCase().match(/\bE_[A-Z_]+\b/)?.[0];
      const known = code ? GATEWAY_ERRORS[code] : undefined;
      if (!code || !known) {
        return out({
          note: 'No known gateway error code in that text. A gateway error starts with one of these codes; an error from api.proxies.sx is explained in the failing tool\'s own answer.',
          knownCodes: Object.keys(GATEWAY_ERRORS),
        });
      }
      return out({ code, httpStatus: known.status, meaning: known.meaning, whatToDo: known.action });
    },

    async pool_get_my_credentials() {
      const { proxyUsername, proxyPassword } = await api.client.get<{ proxyUsername: string | null; proxyPassword: string | null }>('/v1/account/proxy-password');
      if (!proxyUsername || !proxyPassword) {
        return 'This account has no proxy password yet. Set one with pool_set_proxy_password, then call this tool again.';
      }
      return out({
        proxyUsername,
        proxyPassword,
        httpProxy: gatewayUrl('http', proxyUsername, proxyPassword),
        socks5Proxy: gatewayUrl('socks5', proxyUsername, proxyPassword),
        note: 'These URLs let the gateway choose pool and country. Use pool_build_proxy_url to choose them yourself. Contains a secret.',
      });
    },

    async pool_set_proxy_password(a: PoolArgs<'pool_set_proxy_password'>) {
      return out(await api.client.patch('/v1/account/proxy-password', { proxyPassword: a.proxyPassword }));
    },

    async pool_get_my_stats() {
      const stats = await api.client.get<PoolMyStats>('/v1/gateway/pool/my-stats');
      return out({
        myTrafficInMB: stats.myTrafficInMB,
        myTrafficOutMB: stats.myTrafficOutMB,
        myTotalGB: stats.myTotalGB,
        myActiveConnections: stats.myActiveConnections,
        poolHealthScore: stats.poolHealthScore,
        poolConnectedDevices: stats.poolOnlineDevices,
        note: 'Connected devices are not all for sale. pool_get_stock gives the stock listed per country.',
      });
    },

    async pool_list_sessions(a: PoolArgs<'pool_list_sessions'>) {
      return out(await api.client.get(sessions, { pakId: a.pakId }));
    },

    async pool_close_session(a: PoolArgs<'pool_close_session'>) {
      return out(await api.client.delete(`${sessions}/${encodeURIComponent(a.sessionKey)}`, { pakId: a.pakId }));
    },

    async pool_close_all_sessions(a: PoolArgs<'pool_close_all_sessions'>) {
      return out(await api.client.delete(sessions, { pakId: a.pakId }));
    },

    async pool_mint_key(a: PoolArgs<'pool_mint_key'>) {
      return out(await api.client.post(keys, a));
    },

    async pool_list_keys() {
      return out(await api.client.get(keys));
    },

    async pool_topup_key({ keyId, ...body }: PoolArgs<'pool_topup_key'>) {
      return out(await api.client.post(`${keys}/${keyId}/topup`, body));
    },

    async pool_update_key({ keyId, ...body }: PoolArgs<'pool_update_key'>) {
      return out(await api.client.patch(`${keys}/${keyId}`, body));
    },

    async pool_regenerate_key(a: PoolArgs<'pool_regenerate_key'>) {
      return out(await api.client.post(`${keys}/${a.keyId}/regenerate`));
    },

    async pool_reveal_key(a: PoolArgs<'pool_reveal_key'>) {
      return out(await api.client.post(`${keys}/${a.keyId}/reveal`));
    },

    async pool_delete_key(a: PoolArgs<'pool_delete_key'>) {
      return out(await api.client.delete(`${keys}/${a.keyId}`));
    },

    async pool_key_usage(a: PoolArgs<'pool_key_usage'>) {
      return out(await api.client.get(`${keys}/${a.keyId}/usage`, { days: a.days }));
    },

    async pool_key_audit(a: PoolArgs<'pool_key_audit'>) {
      return out(await api.client.get(`${keys}/${a.keyId}/audit`, { limit: a.limit, before: a.before }));
    },
  };
}
