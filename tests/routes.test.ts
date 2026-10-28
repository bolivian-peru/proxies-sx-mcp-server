/**
 * Every tool that talks to the API, with the exact requests it must send.
 * Paths, methods and headers were checked against production on October 8,
 * 2026; the fixtures are the shapes production returned. A wrong method or a
 * missing /v1 prefix fails here instead of in an agent's session.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createProxiesApi } from '../src/api/index.js';
import { allToolDefinitions, createAllToolHandlers } from '../src/tools/index.js';
import { X402Client } from '../src/x402/client.js';
import type { AgentWallet } from '../src/x402/wallet.js';

const BASE = 'https://api.proxies.sx';
const ID = '0123456789abcdef01234567';
const TOKEN = 'x402s_test';

const port = {
  _id: ID, name: 'p1', displayName: 'My port', httpPort: 8001, socksPort: 9001, serverIp: 'm1.example.net',
  proxyLogin: 'login', proxyPassword: 'secret', status: 'active', suspended: false, expiresAt: 1800000000000,
  rotationToken: 'tok123', rotationSettings: { enabled: true, intervalSeconds: 1800, matchCarrier: false, matchCity: false, lastRotatedAt: null, rotationCount: 2 },
  deviceId: { _id: 'd1', country: { name: 'United States', code: 'US' }, carrier: { name: 'T-Mobile US' }, city: { name: 'Sacramento' } },
};
const ticket = { _id: ID, ticketNumber: 'TKT-1', subject: 's', message: 'm', status: 'waiting_customer', category: 'general', priority: 'low', createdAt: '2026-10-08T00:00:00.000Z', replies: [{ message: 'hello', authorType: 'support', createdAt: '2026-10-08T01:00:00.000Z' }] };
const x402Session = { sessionId: 's1', walletAddress: '0xabc', network: 'base', txHash: '0x1', amountUSDC: 4, tier: 'shared', trafficAllocatedGB: 1, trafficUsedGB: 0, portCount: 1, expiresAt: '2026-10-09T00:00:00.000Z', isActive: true, ports: [] };
const x402Port = { id: 'p1', displayName: 'p1', http: 'http://u:p@h:1', socks5: 'socks5://u:p@h:2', expiresAt: '2026-10-09T00:00:00.000Z', expiresInSeconds: 7200, rotationUrl: 'https://api.proxies.sx/v1/rotate/t' };
const KEY = '11111111-2222-4333-8444-555555555555';
const order = { orderId: 'o1', kind: 'buy', status: 'pending', priceUsd: 12, modemId: null, countryName: 'Germany', carrierName: 'Carrier', period: 'day', quantity: 1, regionName: null, createdAt: 'now', error: null, refunded: false };
const tariff = { tariffId: 't1', period: 'day', countryCode: 'DE', countryName: 'Germany', carrierId: 'c1', carrierName: 'Carrier', stock: 3, priceUsd: 12, openvpn: true, p0f: false, p0fStock: 0, regions: [] };
const modem = { id: 'm1', status: 'active', countryCode: 'DE', countryName: 'Germany', carrierName: 'Carrier', period: 'day', regionName: null, expiresAt: 'later', online: true, notAnswering: false, currentIp: '203.0.113.7', rotationInterval: null, credentials: { http: { host: 'modem.example.net', port: 10001, username: 'u', password: 'p' }, socks5: null }, capabilities: {}, rotationToken: null, autoRenew: false, autoRenewIssue: null, autoRenewPeriod: null };
const stock = { pools: { mbl: { us: 2 }, peer: { us: 5, de: 3 } }, totals: { mbl: 2, peer: 8, all: 10 }, ipTypes: { peer: { us: { mobile: 1, residential: 4, datacenter: 7, unclassified: 0 } }, totals: { mobile: 1, residential: 7, datacenter: 7, unclassified: 0 } }, generatedAt: 'now', stale: false };

/** [tool, arguments, expected requests in order, fixture per request (default {}), expected text] */
type Case = [tool: string, args: Record<string, unknown>, requests: string[], fixtures?: unknown[], output?: RegExp];

const cases: Case[] = [
  // Account
  ['get_account_summary', {}, ['GET /v1/account/summary'], [{ balance: 0, currency: 'USD', shared: { slots: { total: 5, used: 0, available: 5 }, trafficGB: { total: 1, used: 0, available: 1 }, daysRemaining: null }, alerts: [{ type: 'low_balance', message: 'Balance is below $10', severity: 'warning' }] }], /\[warning\] Balance is below \$10(?![\s\S]*null days)/],
  ['get_account_usage', {}, ['GET /v1/traffic/balance-breakdown', 'GET /v1/traffic/usage'], [{ trafficUsedGB: 0.5, purchasedTrafficGB: 1, availableTrafficGB: 0, balance: 0, currency: 'USD', pricePerGB: 6 }, { total: { totalGB: 0.5 }, byPort: [{ portId: 'gw_pool', totalGB: 0.4 }] }], /Pool Gateway: 0\.4000 GB[\s\S]*E_BALANCE_EXHAUSTED(?![\s\S]*\$6)/],
  // Billing
  ['get_pricing', {}, ['GET /v1/billing/pricing'], [{ basePrices: { shared: 4 }, volumeDiscounts: [{ minGB: 250, maxGB: null, discountPercent: 40 }], slotTiers: [{ name: 'Starter', minGB: 0, sharedSlots: 5 }], userTierInfo: null }], /250\+ GB: 40% off \(\$2\.40\/GB\)/],
  ['calculate_price', { amount: 0.5 }, ['GET /v1/billing/calculate-price?amount=0.5'], [{ basePrice: 4, discountPercent: 0, pricePerGB: 4, totalPrice: 2, amount: 0.5 }], /TOTAL: \$2\.00/],
  ['purchase_shared_traffic', { quantityGB: 2, couponCode: 'SAVE10' }, ['POST /v1/billing/purchase-traffic {"amount":2,"couponCode":"SAVE10"}'], [{ _id: ID, amount: 2, price: 7.2 }], /Charged: \$7\.20/],
  ['coupon_validate', { code: 'SAVE10', orderAmount: 10 }, ['POST /v1/coupons/validate {"code":"SAVE10","orderAmount":10,"orderType":"traffic"}']],
  ['coupon_redeem', { code: 'FREEGB' }, ['POST /v1/coupons/redeem {"code":"FREEGB"}']],
  ['get_payment_history', {}, ['GET /v1/billing/payments', 'GET /v1/coingate/history'], [[], []], /No payments/],
  // Crypto payments
  ['create_crypto_payment', { amount: 50 }, ['POST /v1/coingate/create-order {"amount":50,"currency":"USD"}'], [{ orderId: 'o1', paymentUrl: 'https://pay.example/o1', amount: 50, status: 'new' }], /https:\/\/pay\.example\/o1/],
  ['check_crypto_payment_status', { orderId: 'o1' }, ['GET /v1/coingate/order/o1'], [{ orderId: 'o1', status: 'paid', priceAmount: 50, balanceCredited: true }], /Paid: the balance has been credited/],
  ['get_pending_crypto_payments', {}, ['GET /v1/coingate/pending'], [[]], /No pending/],
  ['cancel_crypto_payment', { orderId: 'o1' }, ['POST /v1/coingate/cancel/o1'], [{ success: true, message: 'Order canceled' }], /Order canceled/],
  ['get_crypto_payment_info', {}, ['GET /v1/coingate/status'], [{ available: true, supportedCurrencies: ['BTC', 'USDT'] }], /Accepted currencies: BTC, USDT/],
  // Dedicated ports
  ['list_available_countries', { countryId: 'c1' }, ['GET /v1/countries/with-devices?pool=dedicated', 'GET /v1/carriers/country/c1', 'GET /v1/cities/country/c1'], [[{ _id: 'c1', name: 'United States', code: 'US', freeDeviceCount: 3 }], [{ _id: 'k1', name: 'T-Mobile US', freeDeviceCount: 3 }], []], /countryId: c1[\s\S]*T-Mobile US - 3 free device\(s\) - id: k1/],
  ['list_ports', { status: 'active' }, ['GET /v1/ports'], [[{ ...port, deviceId: 'd1', device: port.deviceId }, { ...port, _id: 'other', status: 'expired' }]], /Found 1 ports[\s\S]*United States \| T-Mobile US/],
  ['get_port', { portId: ID }, [`GET /v1/ports/${ID}`], [port], /Country: United States[\s\S]*http:\/\/login:secret@m1\.example\.net:8001/],
  ['create_port', { countryId: 'c1', expiresInDays: 1 }, ['POST /v1/ports {"countryId":"c1","expiresAt":86400}'], [port], /Port created/],
  ['delete_port', { portId: ID }, [`DELETE /v1/ports/${ID}`], [{ message: 'Port deleted' }], /Port deleted/],
  ['update_port_credentials', { portId: ID, proxyLogin: 'new_login' }, [`PUT /v1/ports/${ID}/credentials {"proxyLogin":"new_login"}`], [port]],
  ['update_os_fingerprint', { portId: ID, osFingerprint: 'windows:1' }, [`PATCH /v1/ports/${ID}/os-fingerprint {"osFingerprint":"windows:1"}`], [port]],
  ['reconfigure_port', { portId: 'old', countryId: 'c1' }, ['POST /v1/ports/old/reconfigure {"countryId":"c1"}'], [port], new RegExp(`use ID ${ID} from here on, the old ID old no longer exists`)],
  ['extend_port', { portId: ID, hours: 24 }, [`POST /v1/ports/${ID}/extend-time {"hours":24}`, `GET /v1/ports/${ID}/max-extend-hours`], [{ success: true, message: 'Extended', newExpiresAt: 1800000000000 }, { maxHoursAllowed: 100 }], /Hours still available to add: 100/],
  // Port status
  ['get_port_status', { portId: ID }, [`GET /v1/ports/${ID}/status`], [{ status: 'online', isActive: true, lastChecked: 'now', expiresAt: 1800000000000 }], /Port Status: ONLINE\nActive: yes/],
  ['get_port_ip', { portId: ID }, [`GET /v1/ports/${ID}/ip`], [{ publicIp: 'hidden', serverIp: 'm1.example.net' }], /Server address: m1\.example\.net(?![\s\S]*hidden)/],
  ['ping_port', { portId: ID }, [`GET /v1/ports/${ID}/ping`], [{ success: true, ip: 'hidden', responseTime: 42 }], /Latency: 42ms(?![\s\S]*hidden)/],
  ['speed_test_port', { portId: ID }, [`GET /v1/ports/${ID}/test-speed`], [{ downloadSpeed: 50.58, uploadSpeed: 18.35, ping: 42, testTime: 'now' }], /Download: 50\.58 Mbps/],
  // Port rotation
  ['rotate_port', { portId: ID }, [`GET /v1/ports/${ID}/can-rotate`, `POST /v1/ports/${ID}/rotate`, `GET /v1/ports/${ID}`], [{ canRotate: true }, { success: true, portId: ID, rotationCount: 3, rotationDurationMs: 900, message: 'Rotated' }, port], /Rotated\nRotations so far: 3, took 900 ms[\s\S]*HTTP Port: 8001/],
  ['check_rotation_availability', { portId: ID }, [`GET /v1/ports/${ID}/can-rotate`], [{ canRotate: false, reason: 'Cooldown', cooldownRemaining: 120, nextRotationAt: 'soon', availableDevices: 4 }], /Cooldown remaining: 120 seconds[\s\S]*Other devices free: 4/],
  ['configure_auto_rotation', { portId: ID, enabled: true, intervalMinutes: 30 }, [`PATCH /v1/ports/${ID}/rotation-settings {"enabled":true,"intervalSeconds":1800}`], [port], /Interval: 30 minutes/],
  ['get_rotation_history', { portId: ID }, [`GET /v1/ports/${ID}/rotation-history?limit=10`], [{ rotations: [{ triggerType: 'manual', success: true, rotationDurationMs: 800, country: 'US', carrier: 'T-Mobile US', createdAt: '2026-10-08T00:00:00.000Z' }], total: 1 }], /manual: now on US \/ T-Mobile US \(success, 800 ms\)/],
  ['get_rotation_token_url', { portId: ID }, [`GET /v1/ports/${ID}`], [port], /https:\/\/api\.proxies\.sx\/v1\/rotate\/tok123/],
  // Utilities
  ['get_proxy_connection_string', { portId: ID, protocol: 'socks5' }, [`GET /v1/ports/${ID}`], [port], /socks5:\/\/login:secret@m1\.example\.net:9001/],
  ['get_all_proxy_formats', { portId: ID }, [`GET /v1/ports/${ID}`], [port], /GET https:\/\/api\.proxies\.sx\/v1\/rotate\/tok123/],
  ['get_service_status', {}, ['GET /v1/gateway/incidents', 'GET /v1/x402/status'], [{ incidents: [] }, { overall: 'operational', components: {}, uptime: {}, incidents: [] }], /"overall": "operational"/],
  // Support
  ['create_support_ticket', { subject: 's', message: 'm' }, ['POST /v1/tickets {"subject":"s","message":"m","category":"general","priority":"medium"}'], [ticket], /Ticket TKT-1/],
  ['list_my_tickets', {}, ['GET /v1/tickets'], [[ticket]], /waiting for your reply/],
  ['get_ticket', { ticketId: ID }, [`GET /v1/tickets/${ID}`], [ticket], /Your message:\nm[\s\S]*Support, 2026-10-08T01:00:00\.000Z:\nhello/],
  ['reply_to_ticket', { ticketId: ID, message: 'thanks' }, [`POST /v1/tickets/${ID}/replies {"message":"thanks"}`]],
  ['close_ticket', { ticketId: ID }, [`PATCH /v1/tickets/${ID}/close`]],
  // x402 session management (session token goes in a header, never in the URL)
  ['get_x402_session', { sessionToken: TOKEN }, ['GET /v1/x402/manage/session [X-Session-Token]'], [x402Session]],
  ['list_x402_ports', { sessionToken: TOKEN }, ['GET /v1/x402/manage/ports [X-Session-Token]'], [{ ports: [x402Port] }], /Expires in:\*\* 2\.0 hours/],
  ['get_x402_port_status', { sessionToken: TOKEN, portId: 'p1' }, ['GET /v1/x402/manage/ports/p1/status [X-Session-Token]'], [x402Port]],
  ['get_sessions_by_wallet', { walletAddress: '0xabc', status: 'all' }, ['GET /v1/x402/sessions/wallet/0xabc?status=all'], [{ sessions: [x402Session], total: 1 }]],
  ['get_session_status', { sessionId: 's1' }, ['GET /v1/x402/sessions/s1/status'], [{ id: 's1', status: 'active', walletAddress: '0xabc', expiresAt: 'later', traffic: { allowedGB: 1, usedGB: 0.5, remainingGB: 0.5, percentUsed: 50 } }], /Used:\*\* 0\.5 GB \(50\.0%\)/],
  ['replace_x402_port', { sessionToken: TOKEN, country: 'US' }, ['POST /v1/x402/manage/ports/replace {"country":"US"} [X-Session-Token]'], [{ portId: 'p2', rotationUrl: 'u', proxy: { http: 'h', socks5: 's', expiresAt: 'later' }, traffic: { allocatedGB: 1, usedGB: 0, remainingGB: 1 }, location: { country: 'United States', countryCode: 'US' } }]],
  ['calculate_x402_topup', { sessionToken: TOKEN, addTrafficGB: 1 }, ['GET /v1/x402/manage/session/topup/calculate?addTrafficGB=1 [X-Session-Token]'], [{ trafficCost: 4, durationCost: 0, totalCost: 4, breakdown: { addTrafficGB: 1, addDurationSeconds: 0, trafficPricePerGB: 4, tier: 'shared' } }]],
  ['topup_x402_session', { sessionToken: TOKEN, paymentSignature: '0xhash', addTrafficGB: 1 }, ['POST /v1/x402/manage/session/topup {"addTrafficGB":1} [Payment-Signature,X-Session-Token]'], [{ sessionId: 's1', trafficAllocatedGB: 2, expiresAt: 'later' }]],
  // Ops (admin keys)
  ['ops_get_user', { userId: 'u1' }, ['GET /v1/ops/users/u1']],
  ['ops_get_user_audit', { userId: 'u1', limit: 5 }, ['GET /v1/ops/users/u1/audit?limit=5']],
  ['ops_reconcile_payments', { userId: 'u1' }, ['GET /v1/ops/payments/reconcile/u1']],
  ['ops_list_tickets', { status: 'open' }, ['GET /v1/ops/tickets?status=open']],
  ['ops_reply_ticket', { ticketId: 't1', message: 'm', reason: 'r' }, ['POST /v1/ops/tickets/t1/reply {"message":"m","reason":"r"}']],
  ['ops_set_slots', { userId: 'u1', sharedSlotLimit: 10, reason: 'r' }, ['POST /v1/ops/users/u1/slots {"sharedSlotLimit":10,"reason":"r"}']],
  ['ops_credit_balance', { userId: 'u1', amountUsd: 5, reason: 'r' }, ['POST /v1/ops/users/u1/credit {"amountUsd":5,"reason":"r"}']],
  ['ops_email_user', { userId: 'u1', subject: 's', content: 'c', reason: 'r' }, ['POST /v1/ops/users/u1/email {"subject":"s","content":"c","reason":"r"}']],
  ['ops_list_farmers', {}, ['GET /v1/ops/farmers']],
  ['ops_get_farmer', { farmerId: 'f1' }, ['GET /v1/ops/farmers/f1']],
  ['ops_write_farmer_note', { farmerId: 'f1', note: 'n', reason: 'r' }, ['POST /v1/ops/farmers/f1/note {"note":"n","reason":"r"}']],
  // Pool Gateway
  ['pool_get_stock', { country: 'US' }, ['GET /v1/gateway/pool/stock'], [stock], /"mbl": 2,\s+"peer": 5,\s+"peerByClass": \{\s+"mobile": 1,\s+"residential": 4,\s+"isp": 7/],
  ['pool_get_facets', { country: 'us', carrier: 'tmobile' }, ['GET /v1/gateway/pool/stock/facets?country=US&carrier=tmobile']],
  ['pool_get_my_credentials', {}, ['GET /v1/account/proxy-password'], [{ proxyUsername: 'psx_abc', proxyPassword: 'pw' }], /http:\/\/psx_abc:pw@gw\.proxies\.sx:7000/],
  ['pool_set_proxy_password', { proxyPassword: 'newpass' }, ['PATCH /v1/account/proxy-password {"proxyPassword":"newpass"}']],
  ['pool_get_my_stats', {}, ['GET /v1/gateway/pool/my-stats'], [{ myTotalGB: 1, poolOnlineDevices: 9, poolCountries: ['US'] }], /"poolConnectedDevices": 9(?![\s\S]*poolCountries)/],
  ['pool_list_sessions', { pakId: 'pak_x' }, ['GET /v1/gateway/pool/my-sessions?pakId=pak_x']],
  ['pool_close_session', { sessionKey: 'a:b' }, ['DELETE /v1/gateway/pool/my-sessions/a%3Ab']],
  ['pool_close_all_sessions', {}, ['DELETE /v1/gateway/pool/my-sessions']],
  ['pool_mint_key', { label: 'alice', trafficCapGB: 5 }, ['POST /v1/reseller/pool-keys {"label":"alice","trafficCapGB":5}']],
  ['pool_list_keys', {}, ['GET /v1/reseller/pool-keys']],
  ['pool_topup_key', { keyId: 'k1', addTrafficGB: 5 }, ['POST /v1/reseller/pool-keys/k1/topup {"addTrafficGB":5}']],
  ['pool_update_key', { keyId: 'k1', trafficCapGB: null }, ['PATCH /v1/reseller/pool-keys/k1 {"trafficCapGB":null}']],
  ['pool_regenerate_key', { keyId: 'k1' }, ['POST /v1/reseller/pool-keys/k1/regenerate']],
  ['pool_reveal_key', { keyId: 'k1' }, ['POST /v1/reseller/pool-keys/k1/reveal']],
  ['pool_delete_key', { keyId: 'k1' }, ['DELETE /v1/reseller/pool-keys/k1']],
  ['pool_key_usage', { keyId: 'k1', days: 7 }, ['GET /v1/reseller/pool-keys/k1/usage?days=7']],
  ['pool_key_audit', { keyId: 'k1' }, ['GET /v1/reseller/pool-keys/k1/audit']],
  // Private modems (buy and renew carry an Idempotency-Key; the body never names a supplier)
  ['proxies_modem_catalog', { country: 'de' }, ['GET /v1/private-modems/catalog'], [{ maxCartModems: 5, tariffs: [tariff, { ...tariff, tariffId: 't2', countryCode: 'GB' }] }], /1 plan\(s\)[\s\S]*"tariffId": "t1"(?![\s\S]*"t2")/],
  ['proxies_modem_quote', { tariffId: 't1' }, ['GET /v1/private-modems/catalog'], [{ maxCartModems: 5, tariffs: [tariff] }], /12\.00 USD per modem, 3 in stock[\s\S]*"priceUsd": 12/],
  ['proxies_modem_quote', { modemId: 'm1' }, ['GET /v1/private-modems/m1/renewal-quote'], [{ defaultPeriod: 'week', days: 7, priceUsd: 40, options: [{ period: 'week', days: 7, priceUsd: 40, available: true, reason: null, extendsTo: 'later' }] }], /week 40 USD \(default week\)/],
  ['proxies_modem_buy', { tariffId: 't1', expectedPriceUsd: 12, confirm: true, idempotencyKey: KEY }, ['POST /v1/private-modems/orders {"tariffId":"t1","expectedPriceUsd":12} [Idempotency-Key]'], [order], new RegExp(`Idempotency-Key used: ${KEY}[\\s\\S]*proxies_modem_mine`)],
  ['proxies_modem_buy', { tariffId: 't1', expectedPriceUsd: 12, confirm: true, idempotencyKey: KEY, quantity: 2, confirmAgain: true }, ['POST /v1/private-modems/orders {"items":[{"tariffId":"t1","quantity":2,"expectedPriceUsd":12}],"confirmAgain":true} [Idempotency-Key]'], [{ cartId: 'cart1', orders: [{ ...order, quantity: 2 }] }], /24\.00 USD/],
  ['proxies_modem_buy', { tariffId: 't1', expectedPriceUsd: 12, confirm: true, idempotencyKey: KEY, p0f: true }, ['POST /v1/private-modems/orders {"items":[{"tariffId":"t1","quantity":1,"expectedPriceUsd":12,"p0f":true}]} [Idempotency-Key]'], [{ cartId: 'cart1', orders: [{ ...order, status: 'failed', error: 'no_stock' }] }], /Failed: no_stock[\s\S]*new idempotencyKey/],
  ['proxies_modem_renew', { modemId: 'm1', expectedPriceUsd: 40, period: 'week', confirm: true, idempotencyKey: KEY }, ['POST /v1/private-modems/m1/renew {"expectedPriceUsd":40,"period":"week"} [Idempotency-Key]'], [{ ...order, kind: 'renew', priceUsd: 40 }], /"kind": "renew"/],
  ['proxies_modem_rotate', { modemId: 'm1' }, ['POST /v1/private-modems/m1/rotate'], [{ rotated: true, pending: false, message: 'Rotated' }], /^Rotated\n/],
  ['proxies_modem_mine', {}, ['GET /v1/private-modems/mine'], [{ liveError: null, openOrders: [], recentFailed: [], modems: [modem] }], /1 modem\(s\), 0 open order\(s\)[\s\S]*keep it private[\s\S]*"host": "modem\.example\.net"/],
  // Card top-up
  ['proxies_topup_checkout', { amountUsd: 20, confirm: true }, ['POST /v1/stripe/create-balance-checkout {"amount":20}'], [{ url: 'https://checkout.stripe.com/c/pay/cs_1', sessionId: 'cs_1' }], /A person must open the url[\s\S]*"url": "https:\/\/checkout\.stripe\.com\/c\/pay\/cs_1",\s+"sessionId": "cs_1"/],
  ['proxies_topup_status', { sessionId: 'cs_1' }, ['GET /v1/stripe/balance-checkout/cs_1/receipt'], [{ credited: true }], /credited: read it with get_account_summary/],
  // Private Pool and Reserved IPs
  ['private_pool_list', {}, ['GET /v1/private-pool/pools'], [[]]],
  ['private_pool_build', { countries: ['us'] }, ['POST /v1/private-pool/build-from-balance {"countries":["US"],"deviceCount":1,"dedicateGB":1}']],
  ['private_pool_reveal', { poolId: ID }, [`POST /v1/private-pool/${ID}/reveal`]],
  ['private_pool_usage', { poolId: ID, days: 2 }, [`GET /v1/private-pool/${ID}/usage?days=2`]],
  ['reserved_ip_list', { poolId: ID }, [`GET /v1/private-pool/${ID}/leases`]],
  ['reserved_ip_reserve', { poolId: ID, country: 'US', ipType: 'residential', source: 'peer' }, [`POST /v1/private-pool/${ID}/leases {"country":"us","ipType":"residential","source":"peer"}`]],
  ['reserved_ip_rotate', { leaseId: 'l1' }, ['POST /v1/private-pool/leases/l1/rotate']],
  ['reserved_ip_extend', { leaseId: 'l1', idleTtlSec: 3600 }, ['POST /v1/private-pool/leases/l1/extend {"idleTtlSec":3600}']],
  ['reserved_ip_set_rotation', { leaseId: 'l1', mode: 'auto60' }, ['PATCH /v1/private-pool/leases/l1/rotation-mode {"mode":"auto60"}']],
  ['reserved_ip_release', { leaseId: 'l1' }, ['DELETE /v1/private-pool/leases/l1']],
];

/** Tools that never call the API. */
const LOCAL_TOOLS = ['pool_build_proxy_url', 'pool_explain_error', 'get_os_fingerprint_options'];

/** Record every request as "METHOD path?query {body} [extra headers]" and answer with the queued fixtures. */
function stubFetch(fixtures: unknown[] = []) {
  const seen: string[] = [];
  let call = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    const extra = Object.keys(headers).filter(h => !['Content-Type', 'X-API-Key'].includes(h)).sort();
    const parts = [init.method ?? 'GET', url.replace(BASE, '')];
    if (init.body) parts.push(String(init.body));
    if (extra.length) parts.push(`[${extra.join(',')}]`);
    seen.push(parts.join(' '));
    return new Response(JSON.stringify(fixtures[call++] ?? {}), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
  return seen;
}

afterEach(() => vi.unstubAllGlobals());

describe('API tool routes', () => {
  const handlers = createAllToolHandlers(createProxiesApi({ baseUrl: BASE, token: 'psx_test' }), BASE);

  it('covers every API-key tool', () => {
    expect([...new Set([...cases.map(c => c[0]), ...LOCAL_TOOLS])].sort()).toEqual(allToolDefinitions.map(t => t.name).sort());
  });

  it.each(cases)('%s %j', async (tool, args, requests, fixtures, output) => {
    const seen = stubFetch(fixtures);
    const result = await handlers[tool](args);
    const text = typeof result === 'string' ? result : result.text;
    expect(seen).toEqual(requests);
    expect(text).not.toMatch(/undefined|\[object Object\]|NaN/);
    if (output) expect(text).toMatch(output);
    // A structured result is mirrored in its text
    if (typeof result !== 'string') expect(text).toContain(JSON.stringify(result.structuredContent, null, 2));
  });

  it.each(LOCAL_TOOLS)('%s makes no request', async (tool) => {
    const seen = stubFetch();
    await handlers[tool]({ proxyUsername: 'psx_abc', password: 'pw', error: 'E_INTERNAL' });
    expect(seen).toEqual([]);
  });
});

describe('x402 wallet client routes', () => {
  const requirement = { x402Version: 1, accepts: [{ network: 'solana', payTo: 'SoLpay', maxAmountRequired: '400000' }, { network: 'base', payTo: '0xpay', maxAmountRequired: '400000' }] };

  function walletWith(funds: boolean) {
    return {
      address: '0xwallet',
      getNetwork: () => 'base',
      hasSufficientBalance: vi.fn(async () => funds),
      getBalance: vi.fn(async () => ({ usdc: '0', formatted: '0.00 USDC', network: 'base' })),
      sendUSDC: vi.fn(async () => ({ transactionHash: '0xhash', network: 'base', amount: '400000', recipient: '0xpay' })),
    } as unknown as AgentWallet;
  }

  /** Answer 402 with the payment requirement until a Payment-Signature arrives. */
  function stubPaywall(paidBody: unknown) {
    const seen: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      const signature = (init.headers as Record<string, string> | undefined)?.['Payment-Signature'];
      seen.push(`${init.method ?? 'GET'} ${url.replace(BASE, '')}${signature ? ` [Payment-Signature: ${signature}]` : ''}`);
      return new Response(JSON.stringify(signature ? paidBody : requirement), { status: signature ? 200 : 402 });
    }));
    return seen;
  }

  it.each([`${BASE}`, `${BASE}/v1`])('reads the public catalogue under /v1 with base %s', async (base) => {
    const seen = stubFetch([{}, [], {}, {}, {}]);
    const client = new X402Client(walletWith(false), base);
    await client.getProxyPricing();
    await client.getCountries();
    await client.getHealth();
    await client.getPoolPricing();
    await client.getSessionStatus('s1');
    expect(seen).toEqual(['GET /v1/x402/pricing', 'GET /v1/x402/countries', 'GET /v1/x402/health', 'GET /v1/x402/pool/pricing', 'GET /v1/x402/sessions/s1/status']);
  });

  it('reads the 402 requirement and stops before paying when the wallet is short', async () => {
    const seen = stubPaywall({});
    const wallet = walletWith(false);
    await expect(new X402Client(wallet, BASE).purchaseProxy({ country: 'US' })).rejects.toThrow(/Insufficient USDC balance. Required: \$0\.40/);
    expect(seen).toEqual(['GET /v1/x402/proxy?country=US&duration=3600&traffic=1']);
    expect(wallet.sendUSDC).not.toHaveBeenCalled();
  });

  it('pays the 402 option and retries with the transaction hash in Payment-Signature', async () => {
    const seen = stubPaywall({ session: { id: 's1' } });
    const wallet = walletWith(true);
    await new X402Client(wallet, BASE).purchaseProxy({ country: 'US', trafficGB: 0.1 });
    expect(wallet.sendUSDC).toHaveBeenCalledWith('0xpay', '400000');
    expect(seen).toEqual([
      'GET /v1/x402/proxy?country=US&duration=3600&traffic=0.1',
      'GET /v1/x402/proxy?country=US&duration=3600&traffic=0.1 [Payment-Signature: 0xhash]',
    ]);
  });

  it('names the transaction when the claim fails after the payment was sent', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit = {}) => {
      const paid = !!(init.headers as Record<string, string> | undefined)?.['Payment-Signature'];
      return new Response(JSON.stringify(paid ? { message: 'Payment not yet confirmed' } : requirement), { status: paid ? 400 : 402 });
    }));
    await expect(new X402Client(walletWith(true), BASE).purchaseProxy({ country: 'US' }))
      .rejects.toThrow('Payment verification failed (400): Payment not yet confirmed. USDC was already sent in transaction 0xhash. Do not pay again');
  });

  it('buys pool access the same way, naming the tier only when asked', async () => {
    const seen = stubPaywall({ sessionToken: TOKEN });
    await new X402Client(walletWith(true), BASE).purchasePoolAccess({ tier: 'peer', country: 'de', trafficGB: 0.5 });
    await new X402Client(walletWith(true), BASE).purchasePoolAccess({});
    expect(seen).toEqual([
      'GET /v1/x402/pool?tier=peer&country=de&traffic=0.5',
      'GET /v1/x402/pool?tier=peer&country=de&traffic=0.5 [Payment-Signature: 0xhash]',
      'GET /v1/x402/pool?traffic=1',
      'GET /v1/x402/pool?traffic=1 [Payment-Signature: 0xhash]',
    ]);
  });
});
