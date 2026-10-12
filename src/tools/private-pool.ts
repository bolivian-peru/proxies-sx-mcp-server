/**
 * Private Pool and Reserved IP Tools
 * A Private Pool is a separate gateway credential (its own pak_ key) limited
 * to the countries you choose and paid from the account's GB balance.
 * A Reserved IP is one device held for that pool alone until it is released.
 *
 * The server decides how many devices may be reserved and for how long, and
 * says so in its refusal text: nothing here states those limits.
 */

import { z } from 'zod';
import type { ProxiesApi } from '../api/index.js';
import { readOnly, mutating, destructive } from './annotations.js';
import { FAILOVERS, QUALITY_TIERS } from './pool.js';

const RESERVE_IP_TYPES = ['residential', 'mobile', 'any'] as const;
const RESERVE_SOURCES = ['peer', 'mbl', 'any'] as const;
const LEASE_ROTATION_MODES = ['off', 'auto5', 'auto10', 'auto20', 'auto60'] as const;

const poolId = { type: 'string', description: 'Pool id from private_pool_list' };
const leaseId = { type: 'string', description: 'leaseId from reserved_ip_list' };
const failover = { type: 'string', enum: FAILOVERS, description: 'What may replace the device if it goes offline (default: samecountry; strict = never switch)' };

export const privatePoolToolDefinitions = [
  {
    name: 'private_pool_list',
    annotations: readOnly('Private Pool: List'),
    description: 'List your Private Pools with their countries, status, gateway username, connection strings with the password masked (private_pool_reveal shows the key) and remaining GB. An empty list means the account has none yet.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
  {
    name: 'private_pool_build',
    annotations: mutating('Private Pool: Build'),
    description: 'Create a Private Pool paid from the account\'s existing GB balance: no purchase, traffic is metered from the same balance. Needs at least some GB on the account. The pool gets its own gateway password (see private_pool_reveal) and can hold Reserved IPs.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        countries: { type: 'array', items: { type: 'string' }, description: '2-letter ISO country codes the pool may use, for example ["US", "GB"]' },
        deviceCount: { type: 'number', minimum: 1, maximum: 500, description: 'How many devices you expect to use (default: 1)' },
        dedicateGB: { type: 'number', minimum: 1, maximum: 100000, description: 'GB to show as set aside for this pool (default: 1). A display figure only: usage is always billed to the account balance.' },
        qualityTier: { type: 'string', enum: QUALITY_TIERS, description: 'safe = carrier modems only; standard = modems and peers (default)' },
      },
      required: ['countries'],
    },
  },
  {
    name: 'private_pool_reveal',
    annotations: mutating('Private Pool: Reveal Password'),
    description: 'Show the gateway password (pak_ key) of a Private Pool. Returns a secret, and every call is logged on the pool.',
    inputSchema: { type: 'object' as const, properties: { poolId }, required: ['poolId'] },
  },
  {
    name: 'private_pool_usage',
    annotations: readOnly('Private Pool: Usage'),
    description: 'Get the traffic of a Private Pool per day, in MB.',
    inputSchema: {
      type: 'object' as const,
      properties: { poolId, days: { type: 'number', minimum: 1, maximum: 365, description: 'Days of history (default: 30)' } },
      required: ['poolId'],
    },
  },
  {
    name: 'reserved_ip_list',
    annotations: readOnly('Reserved IP: List'),
    description: 'List the Reserved IPs a Private Pool holds: country, class, carrier, city, rotation mode, whether the device is online, the exit IP last seen, and connection strings with the password masked. Put the key from private_pool_reveal in place of pak_******** before using a string. The exit IP is shown to the owner only: never publish it.',
    inputSchema: { type: 'object' as const, properties: { poolId }, required: ['poolId'] },
  },
  {
    name: 'reserved_ip_reserve',
    annotations: mutating('Reserved IP: Reserve'),
    description: 'Reserve one device for a Private Pool so no other customer is routed through it, and get its connection strings with the password masked. Put the key from private_pool_reveal in place of pak_******** before using a string. The reservation is kept while you use it and released after the idle window. The server keeps part of each country\'s stock unreserved and limits how long a peer device can be held; when it refuses, its message says why. The isp (static) class cannot be reserved.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        poolId,
        country: { type: 'string', description: '2-letter ISO country code' },
        ipType: { type: 'string', enum: RESERVE_IP_TYPES, description: 'IP class (default: any)' },
        source: { type: 'string', enum: RESERVE_SOURCES, description: 'peer devices, carrier modems (mbl), or any (default)' },
        carrier: { type: 'string', description: 'Carrier name from pool_get_facets' },
        asn: { type: 'number', description: 'AS number (peer devices only)' },
        city: { type: 'string', description: 'City from pool_get_facets' },
        state: { type: 'string', description: 'State or region code from pool_get_facets' },
        failover,
        idleTtlSec: { type: 'number', minimum: 1, description: 'Seconds without traffic after which the reservation is released. The server applies its own limits and returns the value in force.' },
      },
      required: ['poolId', 'country'],
    },
  },
  {
    name: 'reserved_ip_rotate',
    annotations: destructive('Reserved IP: Rotate'),
    description: 'Move a Reserved IP to a different device in the same country now. The connection strings stay the same; the exit IP changes. A short cooldown applies between rotations.',
    inputSchema: { type: 'object' as const, properties: { leaseId }, required: ['leaseId'] },
  },
  {
    name: 'reserved_ip_extend',
    annotations: mutating('Reserved IP: Set Idle Window', true),
    description: 'Change how long a Reserved IP is kept without traffic. The server applies its own limits and returns the value in force.',
    inputSchema: {
      type: 'object' as const,
      properties: { leaseId, idleTtlSec: { type: 'number', minimum: 1, description: 'Idle window in seconds' } },
      required: ['leaseId', 'idleTtlSec'],
    },
  },
  {
    name: 'reserved_ip_set_rotation',
    annotations: mutating('Reserved IP: Set Rotation', true),
    description: 'Set whether a Reserved IP moves to another device on a schedule: off (hold the device, the default) or every 5, 10, 20 or 60 minutes. Optionally set the failover policy.',
    inputSchema: {
      type: 'object' as const,
      properties: { leaseId, mode: { type: 'string', enum: LEASE_ROTATION_MODES, description: 'Rotation schedule' }, failover },
      required: ['leaseId', 'mode'],
    },
  },
  {
    name: 'reserved_ip_release',
    annotations: destructive('Reserved IP: Release'),
    description: 'Give a Reserved IP back to the shared pool. Its connection strings stop working.',
    inputSchema: { type: 'object' as const, properties: { leaseId }, required: ['leaseId'] },
  },
] as const;

const poolOnly = z.object({ poolId: z.string().min(1) });
const leaseOnly = z.object({ leaseId: z.string().min(1) });

export const privatePoolSchemas = {
  private_pool_list: z.object({}),
  private_pool_build: z.object({
    countries: z.array(z.string().regex(/^[A-Za-z]{2}$/)).min(1).max(250),
    deviceCount: z.number().int().min(1).max(500).optional(),
    dedicateGB: z.number().int().min(1).max(100000).optional(),
    qualityTier: z.enum(QUALITY_TIERS).optional(),
  }),
  private_pool_reveal: poolOnly,
  private_pool_usage: poolOnly.extend({ days: z.number().min(1).max(365).optional() }),
  reserved_ip_list: poolOnly,
  reserved_ip_reserve: poolOnly.extend({
    country: z.string().regex(/^[A-Za-z]{2}$/),
    ipType: z.enum(RESERVE_IP_TYPES).optional(),
    source: z.enum(RESERVE_SOURCES).optional(),
    carrier: z.string().optional(),
    asn: z.number().int().min(1).optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    failover: z.enum(FAILOVERS).optional(),
    idleTtlSec: z.number().int().min(1).optional(),
  }),
  reserved_ip_rotate: leaseOnly,
  reserved_ip_extend: leaseOnly.extend({ idleTtlSec: z.number().int().min(1) }),
  reserved_ip_set_rotation: leaseOnly.extend({ mode: z.enum(LEASE_ROTATION_MODES), failover: z.enum(FAILOVERS).optional() }),
  reserved_ip_release: leaseOnly,
};

type PrivatePoolArgs<K extends keyof typeof privatePoolSchemas> = z.infer<(typeof privatePoolSchemas)[K]>;

/** Handlers return the API answer as JSON; errors propagate to the server's single tool-error path. */
export function createPrivatePoolToolHandlers(api: ProxiesApi) {
  const out = (r: unknown) => JSON.stringify(r, null, 2);
  const base = '/v1/private-pool';

  return {
    async private_pool_list() {
      return out(await api.client.get(`${base}/pools`));
    },

    async private_pool_build(a: PrivatePoolArgs<'private_pool_build'>) {
      return out(await api.client.post(`${base}/build-from-balance`, {
        countries: a.countries.map(c => c.toUpperCase()),
        deviceCount: a.deviceCount ?? 1,
        dedicateGB: a.dedicateGB ?? 1,
        qualityTier: a.qualityTier,
      }));
    },

    async private_pool_reveal(a: PrivatePoolArgs<'private_pool_reveal'>) {
      return out(await api.client.post(`${base}/${a.poolId}/reveal`));
    },

    async private_pool_usage(a: PrivatePoolArgs<'private_pool_usage'>) {
      return out(await api.client.get(`${base}/${a.poolId}/usage`, { days: a.days }));
    },

    async reserved_ip_list(a: PrivatePoolArgs<'reserved_ip_list'>) {
      return out(await api.client.get(`${base}/${a.poolId}/leases`));
    },

    async reserved_ip_reserve({ poolId: id, ...body }: PrivatePoolArgs<'reserved_ip_reserve'>) {
      return out(await api.client.post(`${base}/${id}/leases`, { ...body, country: body.country.toLowerCase() }));
    },

    async reserved_ip_rotate(a: PrivatePoolArgs<'reserved_ip_rotate'>) {
      return out(await api.client.post(`${base}/leases/${a.leaseId}/rotate`));
    },

    async reserved_ip_extend(a: PrivatePoolArgs<'reserved_ip_extend'>) {
      return out(await api.client.post(`${base}/leases/${a.leaseId}/extend`, { idleTtlSec: a.idleTtlSec }));
    },

    async reserved_ip_set_rotation(a: PrivatePoolArgs<'reserved_ip_set_rotation'>) {
      return out(await api.client.patch(`${base}/leases/${a.leaseId}/rotation-mode`, { mode: a.mode, failover: a.failover }));
    },

    async reserved_ip_release(a: PrivatePoolArgs<'reserved_ip_release'>) {
      return out(await api.client.delete(`${base}/leases/${a.leaseId}`));
    },
  };
}
