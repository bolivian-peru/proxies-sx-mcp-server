#!/usr/bin/env node
/**
 * Live smoke test: start the built server over stdio, as an MCP client does,
 * and call every read-only API-key tool against production.
 *
 *   npm run build && PROXIES_API_KEY=psx_... node tests/live-smoke.mjs
 *
 * Not part of `npm test`: it needs a real key and the network. It changes
 * nothing on the account. Exit code 0 only when every tool answered as
 * expected. Output is masked (IP addresses, keys, passwords).
 *
 * A tool that needs something the account may not have (a dedicated port, a
 * ticket, a Private Pool) is SKIPPED with the reason; set SMOKE_PORT_ID to
 * test the port tools on a port of yours. speed_test_port uses metered
 * traffic and runs only with SMOKE_SPEED_TEST=1.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

const apiKey = process.env.PROXIES_API_KEY;
if (!apiKey) {
  console.error('Set PROXIES_API_KEY to a key of the account to test with.');
  process.exit(2);
}

const mask = (text) => String(text)
  .split(apiKey).join('***')
  .replace(/\b(?!127\.)\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, 'x.x')
  .replace(/\b(pak|psx|x402s)_[A-Za-z0-9]{8,}/g, '$1_***')
  .replace(/(:\/\/[^:\/\s"']+):[^@\s"']+@/g, '$1:***@')
  .replace(/(\/rotate\/)[A-Za-z0-9]+/g, '$1***')
  .replace(/("?(?:proxyPassword|password|Password|key)"?\s*[:=]\s*"?)[^\s",}]+/g, '$1***');

// A refusal that proves the route was reached with the right method and headers
const NEEDS_RESELLER = /missing required scope: customers:|Forbidden resource|reseller/i;
const NEEDS_ADMIN = /Forbidden resource|missing required scope: ops:/i;
const BAD_SESSION_TOKEN = /Invalid session token or session expired/;
const fakeToken = { sessionToken: 'x402s_smoketestsmoketest' };

/** What each read-only tool is called with, and the refusal it may answer with (default: none). */
const plan = {
  pool_get_stock: { args: { country: 'us' } },
  pool_get_facets: { args: { country: 'us', pool: 'all' } },
  pool_build_proxy_url: { args: { proxyUsername: 'psx_smoke', password: 'smoke', pool: 'peer', country: 'us', ipType: 'isp', sid: 'smoke1', rotation: 'sticky' }, expect: /psx_smoke-peer-us-iptype-isp-sid-smoke1-rot-sticky/ },
  pool_explain_error: { args: { error: 'E_BALANCE_EXHAUSTED' }, expect: /get_account_usage/ },
  pool_get_my_credentials: { expect: /gw\.proxies\.sx:7000/ },
  pool_get_my_stats: {},
  pool_list_sessions: {},
  pool_list_keys: { refusal: NEEDS_RESELLER },
  pool_key_usage: { args: { keyId: '000000000000000000000000' }, refusal: NEEDS_RESELLER },
  pool_key_audit: { args: { keyId: '000000000000000000000000' }, refusal: NEEDS_RESELLER },
  private_pool_list: {},
  private_pool_usage: { needs: 'poolId' },
  reserved_ip_list: { needs: 'poolId' },
  proxies_modem_catalog: { expect: /"tariffs"/ },
  proxies_modem_quote: { args: { tariffId: 'smoke_test_no_such_plan' }, refusal: /not in the catalog/ },
  proxies_modem_mine: { expect: /"modems"/ },
  proxies_topup_status: { args: { sessionId: 'cs_smoke_test_no_such_session' }, refusal: /not found|does not offer|billing:topup|Cannot GET/i },
  get_account_summary: { expect: /Balance:/ },
  get_account_usage: { expect: /Pool Gateway:/ },
  get_pricing: { expect: /\/GB/ },
  calculate_price: { args: { amount: 1 }, expect: /TOTAL:/ },
  coupon_validate: { args: { code: 'SMOKETEST1', orderAmount: 10 }, expect: /"valid": false/ },
  get_payment_history: {},
  check_crypto_payment_status: { args: { orderId: 'smoke_test_no_such_order' }, refusal: /not found/i },
  get_pending_crypto_payments: {},
  get_crypto_payment_info: {},
  list_available_countries: {},
  list_ports: {},
  get_port: { needs: 'portId' },
  get_port_status: { needs: 'portId', expect: /Port Status: (ONLINE|OFFLINE|EXPIRED)/ },
  get_port_ip: { needs: 'portId' },
  ping_port: { needs: 'portId' },
  speed_test_port: { needs: 'portId', optIn: 'SMOKE_SPEED_TEST' },
  check_rotation_availability: { needs: 'portId' },
  get_rotation_history: { needs: 'portId' },
  get_rotation_token_url: { needs: 'portId', expect: /\/v1\/rotate\/|does not have a rotation token/ },
  get_proxy_connection_string: { needs: 'portId' },
  get_all_proxy_formats: { needs: 'portId' },
  get_service_status: { expect: /"overall"/ },
  get_os_fingerprint_options: {},
  list_my_tickets: {},
  get_ticket: { needs: 'ticketId' },
  get_x402_session: { args: fakeToken, refusal: BAD_SESSION_TOKEN },
  list_x402_ports: { args: fakeToken, refusal: BAD_SESSION_TOKEN },
  get_x402_port_status: { args: { ...fakeToken, portId: '000000000000000000000000' }, refusal: BAD_SESSION_TOKEN },
  get_sessions_by_wallet: { args: { walletAddress: '0x000000000000000000000000000000000000dEaD' } },
  get_session_status: { args: { sessionId: '000000000000000000000000' }, refusal: /Session not found/ },
  calculate_x402_topup: { args: { ...fakeToken, addTrafficGB: 1 }, refusal: BAD_SESSION_TOKEN },
  ops_get_user: { args: { userId: '000000000000000000000000' }, refusal: NEEDS_ADMIN },
  ops_get_user_audit: { args: { userId: '000000000000000000000000' }, refusal: NEEDS_ADMIN },
  ops_reconcile_payments: { args: { userId: '000000000000000000000000' }, refusal: NEEDS_ADMIN },
  ops_list_tickets: { refusal: NEEDS_ADMIN },
  ops_list_farmers: { refusal: NEEDS_ADMIN },
  ops_get_farmer: { args: { farmerId: '000000000000000000000000' }, refusal: NEEDS_ADMIN },
};

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('../dist/index.js', import.meta.url)), '--toolset=full'],
  env: { PATH: process.env.PATH, PROXIES_API_KEY: apiKey, ...(process.env.PROXIES_API_URL ? { PROXIES_API_URL: process.env.PROXIES_API_URL } : {}) },
  stderr: 'pipe',
});
const client = new Client({ name: 'proxies-sx-live-smoke', version: '1.0.0' }, { capabilities: {} });

async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 120000 });
  return { isError: !!result.isError, text: (result.content ?? []).map((c) => c.text ?? '').join('\n') };
}

const results = { PASS: [], REFUSED: [], SKIP: [], FAIL: [] };
const report = (verdict, name, detail) => {
  results[verdict].push(name);
  console.log(`${verdict.padEnd(7)} ${name}${detail ? `: ${mask(detail).replace(/\s+/g, ' ').slice(0, 160)}` : ''}`);
};

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  const server = client.getServerVersion();
  console.log(`${server.name} ${server.version}: ${tools.length} tools listed, ${tools.filter((t) => t.annotations?.readOnlyHint).length} read-only\n`);

  // Ids of things the account already has, for the tools that need one
  const have = {
    portId: process.env.SMOKE_PORT_ID || (await call('list_ports')).text.match(/Port IDs:\n.*: ([0-9a-f]{24})/)?.[1],
    ticketId: (await call('list_my_tickets')).text.match(/ID: ([0-9a-f]{24})/)?.[1],
    poolId: (await call('private_pool_list')).text.match(/"id": "([0-9a-f]{24})"/)?.[1],
  };

  for (const tool of tools.filter((t) => t.annotations?.readOnlyHint)) {
    const step = plan[tool.name];
    if (!step) {
      report('FAIL', tool.name, 'read-only tool with no entry in the smoke plan');
      continue;
    }
    if (step.optIn && !process.env[step.optIn]) {
      report('SKIP', tool.name, `set ${step.optIn}=1 to run it`);
      continue;
    }
    if (step.needs && !have[step.needs]) {
      report('SKIP', tool.name, `the account has no ${step.needs.replace('Id', '')} to test with`);
      continue;
    }

    const args = step.needs ? { ...step.args, [step.needs]: have[step.needs] } : step.args;
    const { isError, text } = await call(tool.name, args).catch((error) => ({ isError: true, text: `protocol error: ${error.message}` }));
    const broken = /undefined|\[object Object\]|NaN|Cannot (GET|POST|PUT|PATCH|DELETE) /.test(text);

    if (isError && step.refusal?.test(text)) report('REFUSED', tool.name, text);
    else if (isError || broken || (step.expect && !step.expect.test(text))) report('FAIL', tool.name, text);
    else report('PASS', tool.name, text);
  }
} catch (error) {
  report('FAIL', 'live-smoke', error.message);
} finally {
  await client.close().catch(() => {});
}

console.log(`\n${results.PASS.length} passed, ${results.REFUSED.length} correctly refused for this key, ${results.SKIP.length} skipped, ${results.FAIL.length} failed`);
if (results.FAIL.length) console.log(`Failed: ${results.FAIL.join(', ')}`);
process.exit(results.FAIL.length ? 1 : 0);
