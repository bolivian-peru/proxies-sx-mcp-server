/**
 * Private Modem Tools
 * A Private modem is one dedicated 4G/5G modem rented whole, by the day, week
 * or month, with unlimited traffic, paid from the account balance. It is the
 * first answer to any dedicated, unlimited, exclusive-device, p0f or OpenVPN
 * request; per-GB traffic is the Pool Gateway (pool_* tools).
 *
 * Buying and renewing spend money: they need the price the user saw
 * (expectedPriceUsd, checked by the API) and confirm: true, and they send an
 * Idempotency-Key so a retry with the same key never buys twice.
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ProxiesApi, ModemOrder, ModemPeriod, ModemTariff } from '../api/index.js';
import { readOnly, mutating, spending } from './annotations.js';
import { confirmProperty, requireConfirm, structured, type StructuredResult } from './structured.js';

const PERIODS = ['day', 'week', 'month'] as const;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const ID_RULE = 'letters, digits, _ or - (1-64 characters)';

const SHARE = ['all', 'some', 'none'];
const tariffId = { type: 'string', description: 'Plan id from proxies_modem_catalog' };
const modemId = { type: 'string', description: 'Modem id from proxies_modem_mine' };
const idempotencyKey = {
  type: 'string',
  description: 'Optional. Reuse the idempotencyKey a failed call returned to retry it safely (same order, no second charge). Leave it out for a new purchase: a UUID is generated.',
};
const confirmAgain = {
  type: 'boolean',
  description: 'Set true only after a recent_checkout error, when the user really wants the same item again within 2 minutes.',
};

const ERROR_CODES = 'Error codes and what to do: price_changed (quote again, confirm the new price, send it with a NEW idempotencyKey); no_stock (read the catalog again); ' +
  'insufficient_balance (nothing was charged: top up with proxies_topup_checkout, then order again with a NEW idempotencyKey); ' +
  'scope_missing (the API key needs the modems:purchase scope, ticked in the dashboard API keys section); recent_checkout (resend with confirmAgain: true if intended).';

const orderSchema = {
  type: 'object',
  properties: {
    orderId: { type: 'string' },
    kind: { type: 'string', enum: ['buy', 'renew'] },
    status: { type: 'string', enum: ['pending', 'succeeded', 'failed'] },
    priceUsd: { type: 'number' },
    modemId: { type: ['string', 'null'] },
    countryName: { type: 'string' },
    carrierName: { type: 'string' },
    period: { type: 'string', description: 'day, week or month' },
    quantity: { type: 'number' },
    regionName: { type: ['string', 'null'] },
    createdAt: { type: ['string', 'null'] },
    error: { type: ['string', 'null'] },
    refunded: { type: 'boolean' },
  },
  required: ['orderId', 'kind', 'status', 'priceUsd'],
};

/** Order result with the key the request carried, so a retry can reuse it. */
const purchaseOutputSchema = {
  type: 'object',
  properties: {
    idempotencyKey: { type: 'string', description: 'The Idempotency-Key that was sent. Retry a failed call with the same key.' },
    orders: { type: 'array', items: orderSchema },
    cartId: { type: ['string', 'null'] },
    next: { type: 'string', description: 'What to do now' },
  },
  required: ['idempotencyKey', 'orders', 'next'],
};

export const privateModemToolDefinitions = [
  {
    name: 'proxies_modem_catalog',
    annotations: readOnly('Private Modems: Catalog'),
    description: 'List the Private modem plans for sale right now: country, carrier, period (day, week or month), price in USD, stock, OpenVPN and p0f support, regions. ' +
      'A Private modem is one dedicated 4G/5G modem rented whole with unlimited traffic, paid from the account balance: offer it first for any dedicated, unlimited, exclusive-device, p0f or OpenVPN request. ' +
      'Use it to pick a tariffId before proxies_modem_buy. Not for per-GB pool proxies (pool_get_stock). Works with any key. Example: {} or {"country": "GB", "period": "week"}.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        country: { type: 'string', description: 'Optional 2-letter ISO country code filter, for example DE' },
        period: { type: 'string', enum: PERIODS, description: 'Optional period filter' },
      },
      required: [] as string[],
    },
    outputSchema: {
      type: 'object',
      properties: {
        maxCartModems: { type: 'number' },
        tariffs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tariffId: { type: 'string' },
              period: { type: 'string', enum: PERIODS },
              countryCode: { type: 'string' },
              countryName: { type: 'string' },
              carrierName: { type: 'string' },
              stock: { type: 'number' },
              priceUsd: { type: 'number' },
              openvpn: { type: 'string', enum: SHARE, description: 'How many modems of the plan offer OpenVPN' },
              p0f: { type: 'string', enum: SHARE, description: 'How many modems of the plan offer p0f (OS fingerprint)' },
              p0fStock: { type: 'number' },
              regions: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, stock: { type: 'number' }, p0f: { type: 'number', description: 'Modems in this region with p0f' } } } },
            },
            required: ['tariffId', 'period', 'countryCode', 'countryName', 'carrierName', 'stock', 'priceUsd'],
          },
        },
      },
      required: ['maxCartModems', 'tariffs'],
    },
  },
  {
    name: 'proxies_modem_quote',
    annotations: readOnly('Private Modems: Quote'),
    description: 'Price check before spending. With tariffId: the current price in USD and stock of that plan. With modemId: the renewal quote of a rented modem (price per day, week and month, and the new expiry). ' +
      'Show the user the price, then pass it as expectedPriceUsd to proxies_modem_buy or proxies_modem_renew. Give exactly one of tariffId or modemId. Example: {"tariffId": "<id from the catalog>"}.',
    inputSchema: {
      type: 'object' as const,
      properties: { tariffId, modemId },
      required: [] as string[],
    },
    outputSchema: {
      type: 'object',
      properties: {
        tariffId: { type: ['string', 'null'] },
        modemId: { type: ['string', 'null'] },
        priceUsd: { type: ['number', 'null'], description: 'Price of the plan, or of the default renewal period (null when that period is not available)' },
        period: { type: 'string', enum: PERIODS },
        stock: { type: ['number', 'null'] },
        options: {
          type: 'array',
          description: 'Renewal periods (modemId only)',
          items: { type: 'object', properties: { period: { type: 'string', enum: PERIODS }, days: { type: 'number' }, priceUsd: { type: ['number', 'null'] }, available: { type: 'boolean' }, reason: { type: ['string', 'null'] }, extendsTo: { type: ['string', 'null'] } } },
        },
        next: { type: 'string' },
      },
      required: ['priceUsd', 'period', 'next'],
    },
  },
  {
    name: 'proxies_modem_buy',
    annotations: spending('Private Modems: Buy', true),
    description: 'Rent a Private modem (one dedicated 4G/5G modem, unlimited traffic) from the account balance. Spends money: call it only after the user agreed to the exact USD price from proxies_modem_quote or proxies_modem_catalog, pass that price as expectedPriceUsd and set confirm: true. ' +
      'Sends an Idempotency-Key (a new UUID unless idempotencyKey is given) and returns the key it used: if the call failed on the network, retry with the same idempotencyKey and arguments and you get the same order, never a second charge. ' +
      'Setup takes 10-60 s: the credentials appear in proxies_modem_mine. Use quantity, regionId or p0f only when the user asks for them. Needs an API key with the modems:purchase scope. ' +
      `${ERROR_CODES} Example: {"tariffId": "<id>", "expectedPriceUsd": 12, "confirm": true}.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        tariffId,
        expectedPriceUsd: { type: 'number', minimum: 0, description: 'Price in USD of ONE modem for the plan, as proxies_modem_quote returned it. The API refuses a stale price (price_changed).' },
        confirm: confirmProperty,
        quantity: { type: 'integer', minimum: 1, description: 'How many modems of this plan (default 1; maxCartModems in the catalog is the limit). Total charged = quantity x expectedPriceUsd.' },
        regionId: { type: 'string', description: 'Region id from the plan\'s regions, only when the user wants a specific region' },
        p0f: { type: 'boolean', description: 'true to require OS-fingerprint (p0f) support, only when the user asks for it' },
        idempotencyKey,
        confirmAgain,
      },
      required: ['tariffId', 'expectedPriceUsd'],
    },
    outputSchema: purchaseOutputSchema,
  },
  {
    name: 'proxies_modem_renew',
    annotations: spending('Private Modems: Renew', true),
    description: 'Extend the rental of one of your Private modems from the account balance. Spends money: call it only after the user agreed to the exact USD price from proxies_modem_quote (modemId), pass it as expectedPriceUsd for the chosen period and set confirm: true. ' +
      'Sends an Idempotency-Key (a new UUID unless idempotencyKey is given) and returns it; retry a failed call with the same key for the same order. ' +
      `Needs an API key with the modems:purchase scope. ${ERROR_CODES} Also renewal_open: a renewal is already running, wait and read proxies_modem_mine. Example: {"modemId": "<id>", "period": "week", "expectedPriceUsd": 40, "confirm": true}.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        modemId,
        expectedPriceUsd: { type: 'number', minimum: 0, description: 'Price in USD of the chosen period, as proxies_modem_quote returned it' },
        confirm: confirmProperty,
        period: { type: 'string', enum: PERIODS, description: 'Renewal period (default: the quote\'s defaultPeriod)' },
        idempotencyKey,
        confirmAgain,
      },
      required: ['modemId', 'expectedPriceUsd'],
    },
    outputSchema: purchaseOutputSchema,
  },
  {
    name: 'proxies_modem_rotate',
    annotations: mutating('Private Modems: Rotate IP'),
    description: 'Ask one of your Private modems for a new IP address. Returns whether it rotated at once or is pending. ' +
      'Only for Private modems: pool proxies rotate through the username (pool_build_proxy_url), dedicated ports with rotate_port. Example: {"modemId": "<id from proxies_modem_mine>"}.',
    inputSchema: { type: 'object' as const, properties: { modemId }, required: ['modemId'] },
    outputSchema: {
      type: 'object',
      properties: { rotated: { type: 'boolean' }, pending: { type: 'boolean' }, message: { type: 'string' } },
      required: ['rotated', 'pending', 'message'],
    },
  },
  {
    name: 'proxies_modem_mine',
    annotations: readOnly('Private Modems: Mine'),
    description: 'List your rented Private modems: status, expiry, online state, HTTP and SOCKS5 credentials, rotation settings, auto-renew, plus open orders and recent failures. ' +
      'Call it after proxies_modem_buy to collect the credentials (poll every 10 s while an order is pending). The exit IP shown belongs to your own modem: do not publish it. Example: {}.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
    outputSchema: {
      type: 'object',
      properties: {
        liveError: { type: 'boolean', description: 'true when live credentials could not be read this time' },
        openOrders: { type: 'array', items: orderSchema },
        recentFailed: { type: 'array', items: orderSchema },
        modems: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              status: { type: 'string' },
              countryCode: { type: 'string' },
              countryName: { type: 'string' },
              carrierName: { type: 'string' },
              period: { type: 'string', description: 'day, week or month' },
              expiresAt: { type: ['string', 'null'] },
              online: { type: ['boolean', 'null'] },
              currentIp: { type: ['string', 'null'] },
              credentials: { type: ['object', 'null'], description: 'null while setting up, or once expired' },
              autoRenew: { type: 'boolean' },
            },
            required: ['id', 'status', 'countryCode'],
          },
        },
      },
      required: ['openOrders', 'recentFailed', 'modems'],
    },
  },
] as const;

const PENDING_NEXT = 'Setup takes 10-60 s. Poll proxies_modem_mine every 10 s until the modem is listed with credentials; a failed order is refunded and shows under recentFailed.';

function orderResult(idempotencyKey: string, orders: ModemOrder[], cartId: string | null = null): StructuredResult {
  const failed = orders.filter(order => order.status === 'failed');
  const next = failed.length ? `Failed: ${failed.map(order => order.error ?? 'unknown error').join('; ')}. Nothing to retry with this key: fix the cause and order again with a new idempotencyKey.` : PENDING_NEXT;
  const total = orders.reduce((sum, order) => sum + order.priceUsd * order.quantity, 0);
  return structured({ idempotencyKey, orders, cartId, next }, `${orders.length} order(s), ${total.toFixed(2)} USD. Idempotency-Key used: ${idempotencyKey}`);
}

export function createPrivateModemToolHandlers(api: ProxiesApi) {
  return {
    async proxies_modem_catalog(args: { country?: string; period?: ModemPeriod }): Promise<StructuredResult> {
      const catalog = await api.privateModems.getCatalog();
      const country = args.country?.toUpperCase();
      const matches = (tariff: ModemTariff) => (!country || tariff.countryCode === country) && (!args.period || tariff.period === args.period);
      const tariffs = catalog.tariffs.filter(matches);
      const lead = tariffs.length
        ? `${tariffs.length} plan(s). Prices are per modem in USD, traffic unlimited. Quote one with proxies_modem_quote, then buy with proxies_modem_buy.`
        : 'No plan matches. Drop the filters or offer another country from the full catalog.';
      return structured({ maxCartModems: catalog.maxCartModems, tariffs }, lead);
    },

    async proxies_modem_quote(args: { tariffId?: string; modemId?: string }): Promise<StructuredResult> {
      if (!!args.tariffId === !!args.modemId) throw new Error('Give exactly one of tariffId (price of a plan) or modemId (price of a renewal).');
      if (args.modemId) {
        const quote = await api.privateModems.getRenewalQuote(args.modemId);
        return structured({
          tariffId: null,
          modemId: args.modemId,
          priceUsd: quote.priceUsd,
          period: quote.defaultPeriod,
          stock: null,
          options: quote.options,
          next: `Confirm the USD price of the chosen period with the user, then call proxies_modem_renew with that period, expectedPriceUsd and confirm: true.`,
        }, `Renewal of modem ${args.modemId}: ${quote.options.filter(option => option.available).map(option => `${option.period} ${option.priceUsd} USD`).join(', ')} (default ${quote.defaultPeriod}).`);
      }

      const catalog = await api.privateModems.getCatalog();
      const tariff = catalog.tariffs.find(candidate => candidate.tariffId === args.tariffId);
      if (!tariff) throw new Error(`Plan ${args.tariffId} is not in the catalog any more. Read proxies_modem_catalog again and pick another plan.`);
      const next = tariff.stock > 0
        ? 'Confirm this USD price with the user, then call proxies_modem_buy with expectedPriceUsd set to it and confirm: true.'
        : 'Sold out right now: offer another plan from proxies_modem_catalog.';
      return structured({
        tariffId: tariff.tariffId,
        modemId: null,
        priceUsd: tariff.priceUsd,
        period: tariff.period,
        stock: tariff.stock,
        options: [],
        next,
      }, `${tariff.countryName} ${tariff.carrierName}, ${tariff.period}: ${tariff.priceUsd.toFixed(2)} USD per modem, ${tariff.stock} in stock, unlimited traffic.`);
    },

    async proxies_modem_buy(args: { tariffId: string; expectedPriceUsd: number; confirm?: boolean; quantity?: number; regionId?: string; p0f?: boolean; idempotencyKey?: string; confirmAgain?: boolean }): Promise<StructuredResult> {
      requireConfirm(args.confirm, 'bought');
      const key = args.idempotencyKey ?? randomUUID();
      const needsCart = (args.quantity ?? 1) > 1 || args.regionId !== undefined || args.p0f !== undefined;
      if (!needsCart) {
        const order = await api.privateModems.buy(key, args.tariffId, args.expectedPriceUsd, args.confirmAgain);
        return orderResult(key, [order]);
      }
      const item = { tariffId: args.tariffId, quantity: args.quantity ?? 1, expectedPriceUsd: args.expectedPriceUsd, regionId: args.regionId, p0f: args.p0f };
      const cart = await api.privateModems.buyCart(key, [item], args.confirmAgain);
      return orderResult(key, cart.orders, cart.cartId);
    },

    async proxies_modem_renew(args: { modemId: string; expectedPriceUsd: number; confirm?: boolean; period?: ModemPeriod; idempotencyKey?: string; confirmAgain?: boolean }): Promise<StructuredResult> {
      requireConfirm(args.confirm, 'renewed');
      const key = args.idempotencyKey ?? randomUUID();
      const order = await api.privateModems.renew(key, args.modemId, args.expectedPriceUsd, args.period, args.confirmAgain);
      return orderResult(key, [order]);
    },

    async proxies_modem_rotate(args: { modemId: string }): Promise<StructuredResult> {
      const result = await api.privateModems.rotate(args.modemId);
      return structured({ ...result }, result.message);
    },

    async proxies_modem_mine(): Promise<StructuredResult> {
      const mine = await api.privateModems.getMine();
      const lead = [
        `${mine.modems.length} modem(s), ${mine.openOrders.length} open order(s), ${mine.recentFailed.length} recent failure(s).`,
        mine.liveError ? `Live status unavailable: ${mine.liveError}` : '',
        mine.modems.length ? 'currentIp is the exit of your own modem: keep it private.' : '',
      ].filter(Boolean).join(' ');
      return structured({ ...mine }, lead);
    },
  };
}

const id = (what: string) => z.string().regex(ID, `${what} must be ${ID_RULE}`);
const purchaseArgs = {
  expectedPriceUsd: z.number().nonnegative(),
  confirm: z.boolean().optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
  confirmAgain: z.boolean().optional(),
};

export const privateModemSchemas = {
  proxies_modem_catalog: z.object({
    country: z.string().length(2).optional(),
    period: z.enum(PERIODS).optional(),
  }),
  proxies_modem_quote: z.object({
    tariffId: id('tariffId').optional(),
    modemId: id('modemId').optional(),
  }),
  proxies_modem_buy: z.object({
    tariffId: id('tariffId'),
    quantity: z.number().int().min(1).optional(),
    regionId: id('regionId').optional(),
    p0f: z.boolean().optional(),
    ...purchaseArgs,
  }),
  proxies_modem_renew: z.object({
    modemId: id('modemId'),
    period: z.enum(PERIODS).optional(),
    ...purchaseArgs,
  }),
  proxies_modem_rotate: z.object({ modemId: id('modemId') }),
  proxies_modem_mine: z.object({}),
};
