import { describe, it, expect, vi, afterEach } from 'vitest';
import { explainError, explainApiError, redactSecrets, GATEWAY_ERRORS } from '../src/utils/errors.js';
import { ApiClient } from '../src/api/client.js';
import { createMcpServer, normalizeBaseUrl, toolsetFrom } from '../src/server.js';

type CallResult = { isError?: boolean; content: Array<{ text: string }>; structuredContent?: Record<string, unknown> };

/** The tools/call handler of a server, as the SDK would invoke it. */
function toolCall(server: unknown) {
  const handler = (server as { _requestHandlers: Map<string, (request: unknown, extra: unknown) => Promise<CallResult>> })._requestHandlers.get('tools/call')!;
  return (name: string, args: Record<string, unknown>) => handler({ method: 'tools/call', params: { name, arguments: args } }, {});
}

afterEach(() => vi.unstubAllGlobals());

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('explainError', () => {
  it('explains every gateway code with a meaning and an action', () => {
    for (const code of Object.keys(GATEWAY_ERRORS)) {
      const text = explainError(`${code}: something (req: 1234)`);
      expect(text).toContain('What to do:');
      expect(text).toContain(GATEWAY_ERRORS[code].action);
    }
  });

  it('tells an empty balance apart from a wrong password', () => {
    expect(explainError('E_BALANCE_EXHAUSTED: no traffic')).toMatch(/no traffic left.*get_account_usage.*Do not change the password/s);
    expect(explainError('E_AUTH_INVALID: bad credentials')).toMatch(/pool_get_my_credentials/);
    expect(explainError('E_NO_STOCK_COUNTRY: none')).toMatch(/pool_get_stock.*Georgia.*peer-de/s);
  });

  it.each([
    [401, 'Unauthorized', /PROXIES_API_KEY/],
    [403, 'API key missing required scope: billing:write', /only reseller or admin keys.*client\.proxies\.sx\/purchase/],
    [403, 'API key missing required scope: customers:read', /reseller account/],
    [403, 'API key missing required scope: ports:write', /includes the ports:write scope/],
    [403, 'Forbidden resource', /not allowed/],
    [404, 'Cannot GET /tickets', /Update @proxies-sx\/mcp-server/],
    [429, 'ThrottlerException: Too Many Requests', /Rate limited/],
    [502, 'Bad Gateway', /get_service_status/],
  ])('HTTP %i "%s" gets an actionable hint', (status, message, hint) => {
    expect(explainError(message, status)).toMatch(hint);
  });

  it('prefers the fix the API sends over the generic hint and keeps the code', () => {
    const text = explainApiError({ message: 'Price changed', code: 'price_changed', fix: 'Re-read the price and resend with a new Idempotency-Key.' }, 409);
    expect(text).toBe('Price changed [price_changed]\nWhat to do: Re-read the price and resend with a new Idempotency-Key.');
    expect(explainApiError({ message: ['a', 'b'] }, 400)).toBe('a; b');
    expect(explainApiError({}, 502, 'Bad Gateway')).toMatch(/^HTTP 502: Bad Gateway\nWhat to do: /);
  });

  it('adds no hint to an ordinary refusal and never adds one twice', () => {
    expect(explainError('Port not found', 404)).toBe('Port not found');
    const once = explainError('Unauthorized', 401);
    expect(explainError(once, 401)).toBe(once);
  });

  it('masks credentials', () => {
    const text = redactSecrets('key psx_0123456789abcdef0123 pak_ABCDEFGHIJKLMNOP x402s_abcdefabcdef1234 http://psx_user1:hunter2@gw.proxies.sx:7000');
    expect(text).not.toMatch(/0123456789abcdef|ABCDEFGHIJKLMNOP|abcdefabcdef1234|hunter2/);
    expect(text).toContain('gw.proxies.sx:7000');
  });
});

describe('API client errors', () => {
  it('turns a 401 into a message that says how to fix the key', async () => {
    stubFetch(401, { message: 'Unauthorized' });
    const client = new ApiClient({ baseUrl: 'https://api.proxies.sx', token: 'psx_bad' });
    await expect(client.get('/v1/account/summary')).rejects.toThrow(/Unauthorized\nWhat to do: The API key is missing, invalid, expired or revoked/);
  });

  it('joins validation messages and reports an unreachable API', async () => {
    stubFetch(400, { message: ['amount must not be less than 10', 'currency must be a string'] });
    const client = new ApiClient({ baseUrl: 'https://api.proxies.sx' });
    await expect(client.post('/v1/coingate/create-order', {})).rejects.toThrow('amount must not be less than 10; currency must be a string');

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    await expect(client.get('/v1/health')).rejects.toThrow(/Could not reach the Proxies.sx API \(fetch failed\)/);
  });

  it('sends the key only when it has one, and extra headers as headers', async () => {
    const fetchMock = stubFetch(200, {});
    await new ApiClient({ baseUrl: 'https://api.proxies.sx' }).get('/v1/gateway/pool/stock');
    expect(fetchMock.mock.calls[0][1].headers['X-API-Key']).toBeUndefined();

    await new ApiClient({ baseUrl: 'https://api.proxies.sx', token: 'psx_k' }).post('/v1/x', {}, undefined, { 'X-Session-Token': 'x402s_t' });
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://api.proxies.sx/v1/x');
    expect(init.headers).toMatchObject({ 'X-API-Key': 'psx_k', 'X-Session-Token': 'x402s_t' });
  });

  it('refuses an id that would steer the request to another route', async () => {
    const fetchMock = stubFetch(200, {});
    const client = new ApiClient({ baseUrl: 'https://api.proxies.sx', token: 'psx_k' });
    for (const id of ['../ports/abc', '%2e%2e/ports/abc', 'abc?x=1', 'abc#', '.']) {
      await expect(client.patch(`/v1/tickets/${id}/close`)).rejects.toThrow(/characters that are not allowed/);
    }
    expect(fetchMock).not.toHaveBeenCalled();

    await client.delete(`/v1/gateway/pool/my-sessions/${encodeURIComponent('peer:us/sid 1')}`);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.proxies.sx/v1/gateway/pool/my-sessions/peer%3Aus%2Fsid%201');
  });
});

describe('server tool-error path', () => {
  it('accepts the base URL with and without /v1', () => {
    expect(normalizeBaseUrl()).toBe('https://api.proxies.sx');
    expect(normalizeBaseUrl('https://api.proxies.sx/v1')).toBe('https://api.proxies.sx');
    expect(normalizeBaseUrl('https://api.proxies.sx/v1/')).toBe('https://api.proxies.sx');
    expect(normalizeBaseUrl('http://localhost:4500/')).toBe('http://localhost:4500');
  });

  it('reads the toolset from the command line first, then the environment, and refuses an unknown one', () => {
    expect(toolsetFrom([], {})).toBe('default');
    expect(toolsetFrom([], { PROXIES_TOOLSET: 'full' })).toBe('full');
    expect(toolsetFrom(['--toolset=default'], { PROXIES_TOOLSET: 'full' })).toBe('default');
    expect(toolsetFrom(['--toolset=full'], {})).toBe('full');
    expect(() => toolsetFrom(['--toolset=everything'], {})).toThrow(/Unknown toolset "everything"/);
  });

  it('returns isError with the hint and without the key when a tool fails', async () => {
    stubFetch(403, { message: 'API key missing required scope: billing:write' });
    const { server } = await createMcpServer({ apiKey: 'psx_0123456789abcdef0123', baseUrl: 'https://api.proxies.sx/v1', toolset: 'full' });
    const call = (server as unknown as { _requestHandlers: Map<string, (request: unknown, extra: unknown) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>> })._requestHandlers.get('tools/call')!;
    const result = await call({ method: 'tools/call', params: { name: 'purchase_shared_traffic', arguments: { quantityGB: 1 } } }, {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/^Error: Failed to purchase traffic: API key missing required scope: billing:write\nWhat to do: /);
    expect(result.content[0].text).not.toContain('psx_0123456789abcdef0123');
  });

  it('returns the API code and fix as an isError result for a purchase that the API refuses', async () => {
    stubFetch(409, { statusCode: 409, message: 'The price of this plan changed', code: 'price_changed', fix: 'Read the price again, confirm it with the user and resend with the new expectedPriceUsd and a NEW Idempotency-Key.', timestamp: 'now', path: '/v1/private-modems/orders' });
    const { server } = await createMcpServer({ apiKey: 'psx_0123456789abcdef0123' });
    const result = await toolCall(server)('proxies_modem_buy', { tariffId: 't1', expectedPriceUsd: 10, confirm: true });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Error: The price of this plan changed [price_changed]\nWhat to do: Read the price again, confirm it with the user and resend with the new expectedPriceUsd and a NEW Idempotency-Key.');
  });

  it('buys nothing without confirm: true or without expectedPriceUsd, and sends an Idempotency-Key when it buys', async () => {
    const fetchMock = stubFetch(201, { orderId: 'o1', kind: 'buy', status: 'pending', priceUsd: 10, quantity: 1 });
    const { server } = await createMcpServer({ apiKey: 'psx_test' });
    const call = toolCall(server);

    const refused = await call('proxies_modem_buy', { tariffId: 't1', expectedPriceUsd: 10 });
    expect(refused.isError).toBe(true);
    expect(refused.content[0].text).toMatch(/Nothing was bought: confirm is not true.*call again with confirm: true/);
    const renewRefused = await call('proxies_modem_renew', { modemId: 'm1', expectedPriceUsd: 10, confirm: false });
    expect(renewRefused.isError).toBe(true);
    await expect(call('proxies_modem_buy', { tariffId: 't1', confirm: true })).rejects.toThrow(/Invalid arguments for proxies_modem_buy/);
    expect(fetchMock).not.toHaveBeenCalled();

    const bought = await call('proxies_modem_buy', { tariffId: 't1', expectedPriceUsd: 10, confirm: true });
    expect(bought.isError).toBeUndefined();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    const key = init.headers['Idempotency-Key'];
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(init.body).toBe('{"tariffId":"t1","expectedPriceUsd":10}');
    expect(bought.structuredContent).toMatchObject({ idempotencyKey: key, orders: [{ orderId: 'o1' }] });
    expect(bought.content[0].text).toContain(`Idempotency-Key used: ${key}`);

    // A retry reuses the key the first call returned
    await call('proxies_modem_buy', { tariffId: 't1', expectedPriceUsd: 10, confirm: true, idempotencyKey: key });
    expect((fetchMock.mock.calls[1] as unknown as [string, { headers: Record<string, string> }])[1].headers['Idempotency-Key']).toBe(key);
  });

  it('prepares a card top-up for a person to pay and reports when it is credited', async () => {
    const fetchMock = stubFetch(201, { url: 'https://checkout.stripe.com/c/pay/cs_1', sessionId: 'cs_1' });
    const { server } = await createMcpServer({ apiKey: 'psx_test' });
    const call = toolCall(server);

    const refused = await call('proxies_topup_checkout', { amountUsd: 20 });
    expect(refused.isError).toBe(true);
    expect(refused.content[0].text).toMatch(/Nothing was charged: confirm is not true/);
    expect(fetchMock).not.toHaveBeenCalled();

    const checkout = await call('proxies_topup_checkout', { amountUsd: 20, confirm: true });
    expect(checkout.structuredContent).toMatchObject({ url: 'https://checkout.stripe.com/c/pay/cs_1', sessionId: 'cs_1', amountUsd: 20 });
    expect(checkout.content[0].text).toMatch(/A person must open the url and pay by card; the agent cannot/);

    stubFetch(200, { credited: false });
    const status = await call('proxies_topup_status', { sessionId: 'cs_1' });
    expect(status.structuredContent).toMatchObject({ sessionId: 'cs_1', credited: false });
    expect(status.content[0].text).toMatch(/Not paid yet/);
  });

  it('tells the agent that card top-ups are not offered to keys yet when the route is missing', async () => {
    stubFetch(404, { statusCode: 404, message: 'Cannot POST /v1/stripe/create-balance-checkout' });
    const { server } = await createMcpServer({ apiKey: 'psx_test' });
    const result = await toolCall(server)('proxies_topup_checkout', { amountUsd: 20, confirm: true });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/does not offer card top-ups to API keys yet.*client\.proxies\.sx\/purchase/);
    expect(result.content[0].text).not.toMatch(/Update @proxies-sx/);
  });

  it('masks the exact key the server was started with, whatever its shape', async () => {
    stubFetch(400, { message: 'rejected credential old-style-key' });
    const { server } = await createMcpServer({ apiKey: 'old-style-key', toolset: 'full' });
    const call = (server as unknown as { _requestHandlers: Map<string, (request: unknown, extra: unknown) => Promise<{ content: Array<{ text: string }> }>> })._requestHandlers.get('tools/call')!;
    const result = await call({ method: 'tools/call', params: { name: 'list_ports', arguments: {} } }, {});

    expect(result.content[0].text).toBe('Error: Failed to list ports: rejected credential [redacted]');
  });
});
