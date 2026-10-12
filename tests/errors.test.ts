import { describe, it, expect, vi, afterEach } from 'vitest';
import { explainError, redactSecrets, GATEWAY_ERRORS } from '../src/utils/errors.js';
import { ApiClient } from '../src/api/client.js';
import { createMcpServer, normalizeBaseUrl } from '../src/server.js';

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

  it('returns isError with the hint and without the key when a tool fails', async () => {
    stubFetch(403, { message: 'API key missing required scope: billing:write' });
    const { server } = await createMcpServer({ apiKey: 'psx_0123456789abcdef0123', baseUrl: 'https://api.proxies.sx/v1' });
    const call = (server as unknown as { _requestHandlers: Map<string, (request: unknown, extra: unknown) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>> })._requestHandlers.get('tools/call')!;
    const result = await call({ method: 'tools/call', params: { name: 'purchase_shared_traffic', arguments: { quantityGB: 1 } } }, {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/^Error: Failed to purchase traffic: API key missing required scope: billing:write\nWhat to do: /);
    expect(result.content[0].text).not.toContain('psx_0123456789abcdef0123');
  });

  it('masks the exact key the server was started with, whatever its shape', async () => {
    stubFetch(400, { message: 'rejected credential old-style-key' });
    const { server } = await createMcpServer({ apiKey: 'old-style-key' });
    const call = (server as unknown as { _requestHandlers: Map<string, (request: unknown, extra: unknown) => Promise<{ content: Array<{ text: string }> }>> })._requestHandlers.get('tools/call')!;
    const result = await call({ method: 'tools/call', params: { name: 'list_ports', arguments: {} } }, {});

    expect(result.content[0].text).toBe('Error: Failed to list ports: rejected credential [redacted]');
  });
});
