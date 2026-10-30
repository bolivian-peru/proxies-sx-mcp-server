import { describe, it, expect, vi, afterAll, beforeAll } from 'vitest';
import { connect, type AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { startHttpServer } from '../src/http.js';
import { ApiClient } from '../src/api/client.js';
import { PUBLIC_TOOL_NAMES, DEFAULT_TOOL_NAMES } from '../src/tools/index.js';

const realFetch = globalThis.fetch;
let server: Server;
let url: string;

/** Every call the hosted server makes to the Proxies.sx API, with its headers */
const apiCalls: Array<{ url: string; headers: Record<string, string> }> = [];

beforeAll(async () => {
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const target = String(input);
    if (!target.startsWith('https://api.test')) return realFetch(input, init);
    apiCalls.push({ url: target, headers: init?.headers as Record<string, string> });
    return new Response(JSON.stringify({ balance: 1 }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  server = startHttpServer({ port: 0, baseUrl: 'https://api.test' });
  await new Promise(resolve => server.once('listening', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
});

afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});

function rpc(body: unknown, headers: Record<string, string> = {}, query = '') {
  return realFetch(url + query, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function toolNames(headers: Record<string, string> = {}, query = '') {
  const res = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, headers, query);
  return ((await res.json()) as { result: { tools: Array<{ name: string }> } }).result.tools.map(t => t.name);
}

describe('hosted Streamable HTTP server', () => {
  it('initializes and tells a caller without a key how to get one', async () => {
    const res = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
    const { result } = (await res.json()) as { result: { serverInfo: { name: string }; instructions: string } };
    expect(result.serverInfo.name).toBe('proxies-sx-mcp');
    expect(result.instructions).toMatch(/client\.proxies\.sx\/account.*Authorization: Bearer/);
  });

  it('lists the public tools without a key, the default set with one and every tool with toolset=full', async () => {
    expect((await toolNames()).sort()).toEqual([...PUBLIC_TOOL_NAMES].sort());
    expect((await toolNames({ Authorization: 'Bearer psx_a' })).sort()).toEqual([...DEFAULT_TOOL_NAMES].sort());
    expect((await toolNames({ 'X-API-Key': 'psx_a' }, '?toolset=full')).length).toBeGreaterThan(DEFAULT_TOOL_NAMES.length);
  });

  it('sends each caller only its own key, even for concurrent requests', async () => {
    apiCalls.length = 0;
    const call = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_account_summary', arguments: {} } };
    await Promise.all(['psx_alice', 'psx_bob', 'psx_alice', 'psx_bob'].map(key => rpc(call, { Authorization: `Bearer ${key}` })));
    expect(apiCalls.map(c => c.headers['X-API-Key']).sort()).toEqual(['psx_alice', 'psx_alice', 'psx_bob', 'psx_bob']);
  });

  it('forwards the caller IP from the local reverse proxy to the API', async () => {
    apiCalls.length = 0;
    const call = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_account_summary', arguments: {} } };
    await rpc(call, { Authorization: 'Bearer psx_a', 'X-Forwarded-For': '203.0.113.7, 10.0.0.1' });
    // the last entry is the one the local reverse proxy added; earlier ones come from the caller
    expect(apiCalls[0].headers['X-Forwarded-For']).toBe('10.0.0.1');
  });

  it('rejects other methods, bad JSON, unknown toolsets and other paths', async () => {
    expect((await realFetch(url)).status).toBe(405);
    expect((await realFetch(url, { method: 'OPTIONS' })).status).toBe(204);
    expect((await rpc('not json')).status).toBe(400);
    expect((await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, {}, '?toolset=bogus')).status).toBe(400);
    expect((await realFetch(url.replace('/mcp', '/other'))).status).toBe(404);
  });

  it('answers a malformed request line with 400 and keeps serving', async () => {
    const { port } = server.address() as AddressInfo;
    const reply = await new Promise<string>(resolve => {
      const socket = connect(port, '127.0.0.1', () => socket.write('GET http://[x HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n'));
      let data = '';
      socket.on('data', chunk => (data += chunk));
      socket.on('close', () => resolve(data));
    });
    expect(reply).toMatch(/^HTTP\/1\.1 400/);
    expect((await toolNames()).length).toBe(PUBLIC_TOOL_NAMES.length);
  });

  it('refuses a batch larger than 10 requests', async () => {
    const batch = Array.from({ length: 11 }, (_, id) => ({ jsonrpc: '2.0', id, method: 'tools/list' }));
    expect((await rpc(batch)).status).toBe(400);
  });
});

describe('ApiClient path ids', () => {
  it('refuses ids that URL parsing would rewrite into another route', async () => {
    const client = new ApiClient({ baseUrl: 'https://api.test', token: 'psx_a' });
    for (const id of ['x/.\t./.\t./admin', 'x/..', 'x/%2e%2e/admin', 'x?y=1', 'x#y', 'x\\y', 'a b', 'x\n']) {
      await expect(client.get(`/v1/pool/keys/${id}`)).rejects.toThrow(/not allowed/);
    }
  });
});
