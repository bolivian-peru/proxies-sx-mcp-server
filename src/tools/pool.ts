/**
 * Pool Gateway Tools
 * Agent-native interface for the flagship Pool Gateway (gw.proxies.sx:7000/7001
 * — one endpoint, auto-rotating, `pak_` keys + username token DSL).
 *
 * - pool_build_proxy_url runs the DSL builder IN-TOOL (no SDK import needed).
 * - stock + session tools work with any scoped key; mint/list/topup need a
 *   reseller-role key with scope customers:write (the reseller pak model).
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
  opts: { country?: string; carrier?: string; city?: string; sid?: string; rotation?: string; pool?: string; protocol?: string } = {},
): string {
  if (!proxyUsername) throw new Error('proxyUsername is required');
  if (!pakKey) throw new Error('pakKey is required');
  const { country, carrier, city, sid, rotation, pool = 'mbl', protocol = 'http' } = opts;
  const tokens: string[] = [pool];
  if (country) tokens.push(country);
  if (carrier) tokens.push('carrier', carrier);
  if (city) tokens.push('city', city);
  if (sid) tokens.push('sid', sid);
  if (rotation) tokens.push('rot', rotation);
  const user = `${proxyUsername}-${tokens.join('-')}`;
  const port = protocol === 'socks5' ? SOCKS5_PORT : HTTP_PORT;
  return `${protocol}://${encodeURIComponent(user)}:${encodeURIComponent(pakKey)}@${GATEWAY_HOST}:${port}`;
}

export const poolToolDefinitions = [
  { name: 'pool_get_stock', description: 'Live Pool Gateway availability — online endpoint counts per country (no auth). Use to pick a country with stock before building a proxy URL.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] } },
  { name: 'pool_build_proxy_url', description: 'Build a ready-to-use Pool Gateway proxy URL from a reseller proxyUsername + a customer pak_ key, using the username token DSL (pool/country/carrier/city/sid/rot). Pure local builder — no network. rotation: "sticky" (hold IP) | "rotate" (new IP per request). pool: "mbl" (mobile) | "peer".',
    inputSchema: { type: 'object' as const, properties: {
      proxyUsername: { type: 'string', description: 'Reseller proxy username, e.g. psx_abc123' },
      pakKey: { type: 'string', description: 'Customer Pool Access Key (pak_...)' },
      country: { type: 'string', description: 'ISO country, e.g. us, de' },
      carrier: { type: 'string' }, city: { type: 'string' },
      sid: { type: 'string', description: 'Sticky session id (8-64 chars, lowercase a-z0-9_)' },
      rotation: { type: 'string', enum: ['sticky', 'rotate'] },
      pool: { type: 'string', enum: ['mbl', 'peer'] },
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
] as const;

export const poolSchemas = {
  pool_get_stock: z.object({}),
  pool_build_proxy_url: z.object({ proxyUsername: z.string(), pakKey: z.string(), country: z.string().optional(), carrier: z.string().optional(), city: z.string().optional(), sid: z.string().optional(), rotation: z.string().optional(), pool: z.string().optional(), protocol: z.string().optional() }),
  pool_list_sessions: z.object({ pakId: z.string().optional() }),
  pool_close_session: z.object({ sessionKey: z.string(), pakId: z.string().optional() }),
  pool_mint_key: z.object({ label: z.string(), trafficCapGB: z.number().nullable().optional(), expiresAt: z.string().nullable().optional(), qualityTier: z.enum(['safe', 'standard']).optional() }),
  pool_list_keys: z.object({}),
  pool_topup_key: z.object({ keyId: z.string(), addTrafficGB: z.number().optional(), extendDays: z.number().optional() }),
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
  };
}
