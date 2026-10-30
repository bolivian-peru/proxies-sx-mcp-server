/**
 * Hosted mode: the same server over Streamable HTTP (https://api.proxies.sx/mcp)
 *
 * Stateless: every POST builds its own server from that request's API key,
 * so no credential or state is shared between callers. Without a key only
 * the public tools are listed. x402 wallet mode stays local (stdio): a hosted
 * server never holds a caller's wallet key.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { createMcpServer, toolsetFrom, type Toolset } from './server.js';

export interface HttpServerConfig {
  port: number;
  host?: string;
  baseUrl?: string;
}

const MCP_PATH = '/mcp';
const MAX_BODY_BYTES = 1024 * 1024;
/** JSON-RPC batches run every item at once: cap them so one request cannot fan out */
const MAX_BATCH = 10;
/** Requests handled at once by this process; more get 503 */
const MAX_IN_FLIGHT = 100;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-API-Key, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
};

/** The API key from `Authorization: Bearer <key>` or `X-API-Key`, if any */
export function apiKeyFrom(req: IncomingMessage): string | undefined {
  const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '')?.[1];
  const header = req.headers['x-api-key'];
  return bearer || (typeof header === 'string' && header.trim()) || undefined;
}

/** The caller's IP as added by the local reverse proxy (the last X-Forwarded-For entry); ignored from any other peer */
export function callerIpFrom(req: IncomingMessage): string | undefined {
  const peer = req.socket.remoteAddress ?? '';
  if (!/^(127\.|::1$|::ffff:127\.)/.test(peer)) return undefined;
  const forwarded = req.headers['x-forwarded-for'];
  return (typeof forwarded === 'string' && forwarded.split(',').pop()?.trim()) || undefined;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { ...CORS_HEADERS, 'Content-Type': 'application/json' }).end(JSON.stringify(body));
}

function rpcError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, { jsonrpc: '2.0', error: { code: -32000, message }, id: null });
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('Request body is larger than 1 MB');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function handleMcp(req: IncomingMessage, res: ServerResponse, url: URL, baseUrl?: string): Promise<void> {
  let body: unknown;
  let toolset: Toolset;
  try {
    body = await readJson(req);
    if (Array.isArray(body) && body.length > MAX_BATCH) throw new Error(`A batch may hold at most ${MAX_BATCH} requests`);
    toolset = toolsetFrom([`--toolset=${url.searchParams.get('toolset') ?? 'default'}`], {});
  } catch (error) {
    return rpcError(res, 400, error instanceof Error ? error.message : 'Invalid request');
  }

  const { server } = await createMcpServer({ apiKey: apiKeyFrom(req), baseUrl, toolset, forwardedFor: callerIpFrom(req) });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  for (const [name, value] of Object.entries(CORS_HEADERS)) res.setHeader(name, value);
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}

/**
 * Start the hosted Streamable HTTP server
 */
export function startHttpServer(config: HttpServerConfig) {
  let inFlight = 0;
  const httpServer = createServer((req, res) => {
    let url: URL;
    try {
      url = new URL(req.url ?? '/', 'http://localhost');
    } catch {
      return sendJson(res, 400, { error: 'Invalid request URL' });
    }

    if (url.pathname === '/healthz') return sendJson(res, 200, { ok: true });
    if (url.pathname !== MCP_PATH) return sendJson(res, 404, { error: `Not found. The MCP endpoint is ${MCP_PATH}` });
    if (req.method === 'OPTIONS') return void res.writeHead(204, CORS_HEADERS).end();
    // Stateless server: no session stream to open (GET) or end (DELETE)
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS');
      return rpcError(res, 405, 'Method not allowed. Send JSON-RPC requests with POST.');
    }
    if (inFlight >= MAX_IN_FLIGHT) return rpcError(res, 503, 'Busy, retry in a few seconds');

    inFlight++;
    res.on('close', () => inFlight--);
    handleMcp(req, res, url, config.baseUrl).catch(error => {
      console.error('MCP request failed:', error instanceof Error ? error.message : error);
      if (!res.headersSent) rpcError(res, 500, 'Internal server error');
    });
  });

  httpServer.listen(config.port, config.host ?? '127.0.0.1', () => {
    console.error(`Proxies.sx MCP server listening on http://${config.host ?? '127.0.0.1'}:${config.port}${MCP_PATH}`);
  });

  const shutdown = () => httpServer.close(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return httpServer;
}
