/**
 * Pool Gateway Tools
 * Agent-native interface for the flagship Pool Gateway (gw.proxies.sx:7000/7001
 * — one endpoint, auto-rotating, `pak_` keys + username token DSL).
 *
 * - pool_build_proxy_url runs the DSL builder IN-TOOL (no SDK import needed).
 * - stock + session tools work with any scoped key; mint/list/topup need a
 *   reseller-role key with scope customers:write (the reseller pak model).
 * - pool_get_my_* / pool_set_proxy_password are for a single API-key customer
 *   managing their own pool credentials (no reseller role required).
 */

import { z } from 'zod';
import type { ProxiesApi } from '../api/index.js';

const GATEWAY_HOST = 'gw.proxies.sx';
const HTTP_PORT = 7000;
const SOCKS5_PORT = 7001;

/** Pure DSL builder — mirrors @proxies-sx/pool-sdk buildProxyUrl, no network. */
function buildPoolProxyUrl(
  proxyUsername: string,
  pakKey: string,
  opts: { country?: string; carrier?: string; city?: string; sid?: string; rotation?: string; pool?: string; protocol?: string; ipType?: string } = {},
): string {
  if (!proxyUsername) throw new Error('proxyUsername is required');
  if (!pakKey) throw new Error('pakKey is required');
  const { country, carrier, city, sid, rotation, pool = 'mbl', protocol = 'http', ipType } = opts;
  const tokens: string[] = [pool];
  if (country) tokens.push(country);
  if (carrier) tokens.push('carrier', carrier);
  if (city) tokens.push('city', city);
  // Hard IP-class filter (peer/any pools; mbl is mobile by construction).
  if (ipType) tokens.push('iptype', ipType);
  if (sid) tokens.push('sid', sid);
  if (rotation) tokens.push('rot', rotation);
  const user = `${proxyUsername}-${tokens.join('-')}`;
  const port = protocol === 'socks5' ? SOCKS5_PORT : HTTP_PORT;
  return `${protocol}://${encodeURIComponent(user)}:${encodeURIComponent(pakKey)}@${GATEWAY_HOST}:${port}`;
}

export const poolToolDefinitions = [
  { name: 'pool_get_stock', description: 'Live Pool Gateway availability — online endpoint counts per country (no auth). Use to pick a country with stock before building a proxy URL.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] } },
  { name: 'pool_build_proxy_url', description: 'Build a ready-to-use Pool Gateway proxy URL from a reseller proxyUsername + a customer pak_ key, using the username token DSL (pool/country/carrier/city/iptype/sid/rot). Pure local builder — no network. rotation: "sticky"/"hard" hold the modem for the session (needs a sid), "auto5|auto10|auto20|auto60" soft-rotate on an interval, "ondemand" re-picks per connection. pool: "mbl" (mobile carrier modems, 6 countries) | "peer" (~80-country residential+mobile). ipType hard-filters the peer pool to a single exit class.',
    inputSchema: { type: 'object' as const, properties: {
      proxyUsername: { type: 'string', description: 'Reseller proxy username, e.g. psx_abc123' },
      pakKey: { type: 'string', description: 'Customer Pool Access Key (pak_...)' },
      country: { type: 'string', description: 'ISO country, e.g. us, de' },
      carrier: { type: 'string' }, city: { type: 'string' },
      ipType: { type: 'string', enum: ['mobile', 'residential', 'datacenter'], description: 'Hard IP-class filter for the peer pool: mobile = cellular-carrier IPs, residential = home/ISP IPs, datacenter = hosting IPs. Emits -iptype-<v>; unclassified peers are excluded. Omit for any class. mbl is mobile by construction so this is only meaningful for peer/any.' },
      sid: { type: 'string', description: 'Sticky session id (1-64 chars, lowercase a-z0-9_). Required for sticky/auto rotation to persist across connections.' },
      rotation: { type: 'string', enum: ['sticky', 'hard', 'auto5', 'auto10', 'auto20', 'auto60', 'ondemand'] },
      pool: { type: 'string', enum: ['mbl', 'peer', 'any', 'best'] },
      protocol: { type: 'string', enum: ['http', 'socks5'] },
    }, required: ['proxyUsername', 'pakKey'] } },
  { name: 'pool_list_sessions', description: 'List your live Pool Gateway sessions (traffic stats, exit IP, country). Pass pakId to scope to one customer (multi-tenant). Scope ports:read.',
    inputSchema: { type: 'object' as const, properties: { pakId: { type: 'string' } }, required: [] } },
  { name: 'pool_close_session', description: 'Close one live Pool Gateway session by its sessionKey. Pass pakId to scope to one customer. Scope ports:write.',
    inputSchema: { type: 'object' as const, properties: { sessionKey: { type: 'string' }, pakId: { type: 'string' } }, required: ['sessionKey'] } },
  { name: 'pool_mint_key', description: 'Mint a new Pool Access Key (pak_) for a customer. Reseller-role key + scope customers:write required. trafficCapGB null = unlimited within your pool. qualityTier "safe" routes only premium (mbl) stock.',
    inputSchema: { type: 'object' as const, properties: {
      label: { type: 'string', description: 'Human label, 1-256 chars, e.g. customer:alice@example.com' },
      trafficCapGB: { type: 'number', description: '1-100000, or null for unlimited' },
      expiresAt: { type: 'string', description: 'ISO date (future), or null for never' },
      qualityTier: { type: 'string', enum: ['safe', 'standard'] },
    }, required: ['label'] } },
  { name: 'pool_list_keys', description: 'List your Pool Access Keys (masked). Reseller-role key + scope customers:write/read.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] } },
  { name: 'pool_topup_key', description: 'Top up a Pool Access Key: add traffic cap and/or extend expiry (atomic). Reseller-role key + scope customers:write.',
    inputSchema: { type: 'object' as const, properties: {
      keyId: { type: 'string' }, addTrafficGB: { type: 'number', description: '1-100000' }, extendDays: { type: 'number', description: '1-1825' },
    }, required: ['keyId'] } },
  { name: 'pool_get_my_credentials', description: 'Get your own Pool Gateway credentials — proxyUsername and ready-to-use HTTP/SOCKS5 connect strings. Scope account:read.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] } },
  { name: 'pool_get_my_stats', description: 'Get your personal Pool Gateway usage (traffic, active connections) plus aggregated pool health (total/online devices, countries). Does not show individual modem details. Scope ports:read.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] } },
  { name: 'pool_set_proxy_password', description: 'Set or update your proxy authentication password — separate from your account login password, min 6 chars. Scope account:write.',
    inputSchema: { type: 'object' as const, properties: {
      proxyPassword: { type: 'string', description: 'New proxy password, min 6 characters' },
    }, required: ['proxyPassword'] } },
  { name: 'pool_update_key', description: 'Update a Pool Access Key\'s label/enabled/trafficCapGB/expiresAt/qualityTier. Pass trafficCapGB or expiresAt as null to clear them. For growing the cap/expiry, prefer pool_topup_key (atomic, no read-modify-write race). Reseller-role key + scope customers:write.',
    inputSchema: { type: 'object' as const, properties: {
      keyId: { type: 'string' },
      label: { type: 'string', description: '1-256 chars' },
      enabled: { type: 'boolean' },
      trafficCapGB: { type: 'number', description: '1-100000, or null to clear (unbounded)' },
      expiresAt: { type: 'string', description: 'ISO date (future), or null to clear' },
      qualityTier: { type: 'string', enum: ['safe', 'standard'] },
    }, required: ['keyId'] } },
  { name: 'pool_regenerate_key', description: 'Rotate a Pool Access Key\'s secret pak_ value — the old value stops working immediately, same key id. Reseller-role key + scope customers:write.',
    inputSchema: { type: 'object' as const, properties: { keyId: { type: 'string' } }, required: ['keyId'] } },
  { name: 'pool_reveal_key', description: 'Reveal the full pak_ secret for a key (audit-logged as a "reveal" event — use for the explicit-consent unmask path, not routine polling). Reseller-role key + scope customers:read.',
    inputSchema: { type: 'object' as const, properties: { keyId: { type: 'string' } }, required: ['keyId'] } },
  { name: 'pool_delete_key', description: 'Delete a Pool Access Key. Reseller-role key + scope customers:write.',
    inputSchema: { type: 'object' as const, properties: { keyId: { type: 'string' } }, required: ['keyId'] } },
  { name: 'pool_key_usage', description: 'Daily in/out MB bandwidth time-series for one Pool Access Key (default 30 days, max 365), gap-filled with zeroes. Reseller-role key + scope customers:read.',
    inputSchema: { type: 'object' as const, properties: {
      keyId: { type: 'string' }, days: { type: 'number', description: 'Default 30, max 365' },
    }, required: ['keyId'] } },
  { name: 'pool_key_audit', description: 'Forensic audit log for one Pool Access Key: create/update/topup/regenerate/reveal/delete/gateway_auth_success/gateway_auth_failure/auto_suspended_* events, newest first. Reseller-role key + scope customers:read.',
    inputSchema: { type: 'object' as const, properties: {
      keyId: { type: 'string' }, limit: { type: 'number' }, before: { type: 'string', description: 'ISO date — paginate to events before this timestamp' },
    }, required: ['keyId'] } },
] as const;

export const poolSchemas = {
  pool_get_stock: z.object({}),
  pool_build_proxy_url: z.object({ proxyUsername: z.string(), pakKey: z.string(), country: z.string().optional(), carrier: z.string().optional(), city: z.string().optional(), ipType: z.enum(['mobile', 'residential', 'datacenter']).optional(), sid: z.string().optional(), rotation: z.string().optional(), pool: z.string().optional(), protocol: z.string().optional() }),
  pool_list_sessions: z.object({ pakId: z.string().optional() }),
  pool_close_session: z.object({ sessionKey: z.string(), pakId: z.string().optional() }),
  pool_mint_key: z.object({ label: z.string(), trafficCapGB: z.number().nullable().optional(), expiresAt: z.string().nullable().optional(), qualityTier: z.enum(['safe', 'standard']).optional() }),
  pool_list_keys: z.object({}),
  pool_topup_key: z.object({ keyId: z.string(), addTrafficGB: z.number().optional(), extendDays: z.number().optional() }),
  pool_get_my_credentials: z.object({}),
  pool_get_my_stats: z.object({}),
  pool_set_proxy_password: z.object({ proxyPassword: z.string().min(6) }),
  pool_update_key: z.object({
    keyId: z.string(),
    label: z.string().optional(),
    enabled: z.boolean().optional(),
    trafficCapGB: z.number().nullable().optional(),
    expiresAt: z.string().nullable().optional(),
    qualityTier: z.enum(['safe', 'standard']).optional(),
  }),
  pool_regenerate_key: z.object({ keyId: z.string() }),
  pool_reveal_key: z.object({ keyId: z.string() }),
  pool_delete_key: z.object({ keyId: z.string() }),
  pool_key_usage: z.object({ keyId: z.string(), days: z.number().optional() }),
  pool_key_audit: z.object({ keyId: z.string(), limit: z.number().optional(), before: z.string().optional() }),
};

export function createPoolToolHandlers(api: ProxiesApi) {
  const out = (r: unknown) => JSON.stringify(r, null, 2);
  const err = (e: unknown) => `Error: ${e instanceof Error ? e.message : String(e)}`;
  return {
    async pool_get_stock() { try { return out(await api.client.get('/v1/gateway/pool/availability')); } catch (e) { return err(e); } },
    async pool_build_proxy_url(a: { proxyUsername: string; pakKey: string; country?: string; carrier?: string; city?: string; sid?: string; rotation?: string; pool?: string; protocol?: string }) {
      try {
        const url = buildPoolProxyUrl(a.proxyUsername, a.pakKey, a);
        return out({ proxyUrl: url, host: GATEWAY_HOST, httpPort: HTTP_PORT, socks5Port: SOCKS5_PORT, note: 'Substitute the pak_ value before sharing; never log the full URL.' });
      } catch (e) { return err(e); }
    },
    async pool_list_sessions(a: { pakId?: string }) { try { return out(await api.client.get('/v1/gateway/pool/my-sessions', a.pakId ? { pakId: a.pakId } : undefined)); } catch (e) { return err(e); } },
    async pool_close_session(a: { sessionKey: string; pakId?: string }) {
      try {
        const qs = a.pakId ? `?pakId=${encodeURIComponent(a.pakId)}` : '';
        return out(await api.client.delete(`/v1/gateway/pool/my-sessions/${encodeURIComponent(a.sessionKey)}${qs}`));
      } catch (e) { return err(e); }
    },
    async pool_mint_key(a: { label: string; trafficCapGB?: number | null; expiresAt?: string | null; qualityTier?: string }) { try { return out(await api.client.post('/v1/reseller/pool-keys', { label: a.label, trafficCapGB: a.trafficCapGB, expiresAt: a.expiresAt, qualityTier: a.qualityTier })); } catch (e) { return err(e); } },
    async pool_list_keys() { try { return out(await api.client.get('/v1/reseller/pool-keys')); } catch (e) { return err(e); } },
    async pool_topup_key(a: { keyId: string; addTrafficGB?: number; extendDays?: number }) { try { return out(await api.client.post(`/v1/reseller/pool-keys/${a.keyId}/topup`, { addTrafficGB: a.addTrafficGB, extendDays: a.extendDays })); } catch (e) { return err(e); } },
    async pool_get_my_credentials() { try { return out(await api.client.get('/v1/gateway/credentials')); } catch (e) { return err(e); } },
    async pool_get_my_stats() { try { return out(await api.client.get('/v1/gateway/pool/my-stats')); } catch (e) { return err(e); } },
    async pool_set_proxy_password(a: { proxyPassword: string }) { try { return out(await api.client.patch('/v1/account/proxy-password', { proxyPassword: a.proxyPassword })); } catch (e) { return err(e); } },
    async pool_update_key(a: { keyId: string; label?: string; enabled?: boolean; trafficCapGB?: number | null; expiresAt?: string | null; qualityTier?: string }) {
      try {
        const { keyId, ...body } = a;
        return out(await api.client.patch(`/v1/reseller/pool-keys/${keyId}`, body));
      } catch (e) { return err(e); }
    },
    async pool_regenerate_key(a: { keyId: string }) { try { return out(await api.client.post(`/v1/reseller/pool-keys/${a.keyId}/regenerate`)); } catch (e) { return err(e); } },
    async pool_reveal_key(a: { keyId: string }) { try { return out(await api.client.post(`/v1/reseller/pool-keys/${a.keyId}/reveal`)); } catch (e) { return err(e); } },
    async pool_delete_key(a: { keyId: string }) { try { return out(await api.client.delete(`/v1/reseller/pool-keys/${a.keyId}`)); } catch (e) { return err(e); } },
    async pool_key_usage(a: { keyId: string; days?: number }) { try { return out(await api.client.get(`/v1/reseller/pool-keys/${a.keyId}/usage`, a.days ? { days: a.days } : undefined)); } catch (e) { return err(e); } },
    async pool_key_audit(a: { keyId: string; limit?: number; before?: string }) { try { return out(await api.client.get(`/v1/reseller/pool-keys/${a.keyId}/audit`, { limit: a.limit, before: a.before })); } catch (e) { return err(e); } },
  };
}
