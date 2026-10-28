import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';
import { createMcpServer } from '../src/server.js';
import { allToolDefinitions, allSchemas, toolGroups, DEFAULT_TOOL_NAMES, PUBLIC_TOOL_NAMES } from '../src/tools/index.js';
import { x402ToolDefinitions, x402Schemas } from '../src/x402/tools.js';

const API_KEY = 'psx_test';
const WALLET_KEY = `0x${'11'.repeat(32)}`;
const everyDefinition = [...allToolDefinitions, ...x402ToolDefinitions];
const everySchema: Record<string, { safeParse: (data: unknown) => { success: boolean } }> = { ...allSchemas, ...x402Schemas };

describe('tool registry', () => {
  it('has unique names, and every tool sits in exactly one category', () => {
    const names = everyDefinition.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(toolGroups.flatMap(group => group.tools.map(t => t.name))).toEqual(allToolDefinitions.map(t => t.name));
  });

  it('registers a handler for every listed tool and lists a tool for every handler (both modes at once)', async () => {
    const { toolHandlers, toolDefinitions } = await createMcpServer({ apiKey: API_KEY, walletPrivateKey: WALLET_KEY, toolset: 'full' });
    expect(toolDefinitions.map(t => t.name).sort()).toEqual(everyDefinition.map(t => t.name).sort());
    expect(Object.keys(toolHandlers).sort()).toEqual(everyDefinition.map(t => t.name).sort());
    for (const tool of toolDefinitions) {
      expect(typeof toolHandlers[tool.name], tool.name).toBe('function');
    }
  });

  it('lists the default toolset with an API key, every API tool with toolset full, and the public plus wallet tools with a wallet only', async () => {
    const defaultMode = await createMcpServer({ apiKey: API_KEY });
    expect(defaultMode.toolDefinitions.map(t => t.name)).toEqual(allToolDefinitions.filter(t => DEFAULT_TOOL_NAMES.includes(t.name)).map(t => t.name));
    expect(defaultMode.toolDefinitions).toHaveLength(20);
    expect(DEFAULT_TOOL_NAMES).toHaveLength(20);
    for (const name of DEFAULT_TOOL_NAMES) {
      expect(allToolDefinitions.some(t => t.name === name), name).toBe(true);
    }

    const fullMode = await createMcpServer({ apiKey: API_KEY, toolset: 'full' });
    expect(fullMode.toolDefinitions.map(t => t.name)).toEqual(allToolDefinitions.map(t => t.name));
    expect(fullMode.toolDefinitions.length).toBeGreaterThan(defaultMode.toolDefinitions.length);

    // The toolset flag never touches the wallet tools
    const hybridDefault = await createMcpServer({ apiKey: API_KEY, walletPrivateKey: WALLET_KEY });
    expect(hybridDefault.toolDefinitions.map(t => t.name).sort()).toEqual([...DEFAULT_TOOL_NAMES, ...x402ToolDefinitions.map(t => t.name)].sort());

    const walletMode = await createMcpServer({ walletPrivateKey: WALLET_KEY });
    expect(walletMode.toolDefinitions.map(t => t.name).sort()).toEqual([...PUBLIC_TOOL_NAMES, ...x402ToolDefinitions.map(t => t.name)].sort());
    for (const name of PUBLIC_TOOL_NAMES) {
      expect(allToolDefinitions.some(t => t.name === name), name).toBe(true);
    }
  });

  it('gives every tool a complete annotations block and a description', () => {
    for (const tool of everyDefinition) {
      expect(tool.annotations, tool.name).toBeDefined();
      expect(tool.annotations.title.length, tool.name).toBeGreaterThan(0);
      for (const hint of ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'] as const) {
        expect(typeof tool.annotations[hint], `${tool.name}.${hint}`).toBe('boolean');
      }
      expect(tool.annotations.readOnlyHint && tool.annotations.destructiveHint, tool.name).toBe(false);
      expect(tool.description.length, tool.name).toBeGreaterThan(20);
    }
  });

  it('marks exactly the irreversible tools destructive', () => {
    const destructive = everyDefinition.filter(t => t.annotations.destructiveHint).map(t => t.name).sort();
    expect(destructive).toEqual([
      'cancel_crypto_payment',
      'delete_port',
      'pool_close_all_sessions',
      'pool_close_session',
      'pool_delete_key',
      'pool_regenerate_key',
      'proxies_modem_buy',
      'proxies_modem_renew',
      'proxies_topup_checkout',
      'reconfigure_port',
      'replace_x402_port',
      'reserved_ip_release',
      'reserved_ip_rotate',
      'rotate_port',
      'x402_pool_regenerate',
      'x402_rotate_ip',
    ]);
  });

  it('marks the spending tools: an Idempotency-Key makes buy and renew idempotent, a top-up link is not', () => {
    const spending = (name: string) => everyDefinition.find(t => t.name === name)!.annotations;
    expect(spending('proxies_modem_buy')).toMatchObject({ destructiveHint: true, idempotentHint: true, readOnlyHint: false });
    expect(spending('proxies_modem_renew')).toMatchObject({ destructiveHint: true, idempotentHint: true });
    expect(spending('proxies_topup_checkout')).toMatchObject({ destructiveHint: true, idempotentHint: false });
    for (const name of ['proxies_modem_buy', 'proxies_modem_renew', 'proxies_topup_checkout']) {
      const tool = everyDefinition.find(t => t.name === name)!;
      expect(tool.description, name).toMatch(/confirm: true/);
      expect(Object.keys(tool.inputSchema.properties), name).toContain('confirm');
    }
  });

  it('gives every tool with an outputSchema a valid object schema', () => {
    const ajv = new Ajv({ strict: false, allErrors: true });
    const structuredTools = everyDefinition.filter(t => 'outputSchema' in t);
    expect(structuredTools.map(t => t.name)).toEqual([
      'proxies_modem_catalog', 'proxies_modem_quote', 'proxies_modem_buy', 'proxies_modem_renew', 'proxies_modem_rotate', 'proxies_modem_mine',
      'proxies_topup_checkout', 'proxies_topup_status',
    ]);
    for (const tool of structuredTools) {
      const schema = (tool as { outputSchema: { type: string } }).outputSchema;
      expect(schema.type, tool.name).toBe('object');
      expect(() => ajv.compile(schema), tool.name).not.toThrow();
    }
  });

  it('never names the modem supplier or an unmasked IP address in a description, schema or shipped document', () => {
    // Addresses from the documentation ranges (RFC 5737) are allowed in examples
    const UNMASKED_IPV4 = /\b(?!192\.0\.2\.|198\.51\.100\.|203\.0\.113\.|127\.0\.0\.)\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;
    for (const tool of everyDefinition) {
      const text = JSON.stringify(tool);
      expect(text, tool.name).not.toMatch(/coronium/i);
      expect(text, tool.name).not.toMatch(UNMASKED_IPV4);
    }
    for (const file of ['README.md', 'SKILL.md', 'llm.txt', 'tools.json', 'manifest.json', 'server.json', 'CHANGELOG.md']) {
      const text = readFileSync(join(__dirname, '..', file), 'utf8');
      expect(text, file).not.toMatch(/coronium/i);
      expect(text, file).not.toMatch(UNMASKED_IPV4);
    }
  });

  it('accepts the backend\'s real Private modem shapes in the output schemas (feature shares, nulls while setting up)', () => {
    const ajv = new Ajv({ strict: false, allErrors: true });
    const schemaOf = (name: string) => (allToolDefinitions.find(t => t.name === name) as unknown as { outputSchema: object }).outputSchema;
    const order = { orderId: 'pmb1', kind: 'buy', status: 'pending', priceUsd: 12, modemId: null, countryName: 'Germany', carrierName: 'O2', period: 'day', quantity: 1, regionName: null, createdAt: null, error: null, refunded: false };
    const samples: Array<[string, unknown]> = [
      ['proxies_modem_catalog', { maxCartModems: 20, tariffs: [{ tariffId: 'pt_x', period: 'day', countryCode: 'DE', countryName: 'Germany', carrierId: null, carrierName: 'O2', stock: 3, priceUsd: 12, openvpn: 'some', p0f: 'none', p0fStock: 0, regions: [{ id: 'pr_x', name: 'Berlin', stock: 2, p0f: 0 }] }] }],
      ['proxies_modem_mine', { liveError: false, openOrders: [order], recentFailed: [], modems: [{ id: 'm1', status: 'active', countryCode: 'DE', countryName: 'Germany', carrierName: 'O2', period: 'day', regionName: null, expiresAt: null, online: null, notAnswering: false, currentIp: null, rotationInterval: null, credentials: null, capabilities: null, rotationToken: null, autoRenew: false, autoRenewIssue: null, autoRenewPeriod: null }] }],
      ['proxies_modem_quote', { tariffId: null, modemId: 'm1', priceUsd: null, period: 'week', stock: null, options: [{ period: 'day', days: 1, priceUsd: null, available: false, reason: 'Not available for this modem right now.', extendsTo: null }], next: 'x' }],
      ['proxies_modem_buy', { idempotencyKey: 'k', orders: [order], cartId: null, next: 'x' }],
    ];
    for (const [name, sample] of samples) {
      const validate = ajv.compile(schemaOf(name));
      expect(validate(sample), `${name}: ${JSON.stringify(validate.errors)}`).toBe(true);
    }
  });

  it('gives every tool a valid JSON Schema that agrees with its zod schema on what is required', () => {
    const ajv = new Ajv({ strict: false, allErrors: true });
    for (const tool of everyDefinition) {
      const schema = tool.inputSchema as { type: string; properties: Record<string, unknown>; required: readonly string[] };
      expect(schema.type, tool.name).toBe('object');
      expect(() => ajv.compile(schema), tool.name).not.toThrow();
      for (const name of schema.required) {
        expect(Object.keys(schema.properties), `${tool.name}.${name}`).toContain(name);
      }

      const zodSchema = everySchema[tool.name];
      expect(zodSchema, `${tool.name} has no zod schema`).toBeDefined();
      expect(zodSchema.safeParse({}).success, `${tool.name}: required arguments differ between JSON Schema and zod`).toBe(schema.required.length === 0);
    }
    expect(Object.keys(everySchema).sort()).toEqual(everyDefinition.map(t => t.name).sort());
  });

  it('keeps hand-written live numbers and retired products out of the descriptions', () => {
    for (const tool of everyDefinition) {
      expect(tool.description, tool.name).not.toMatch(/\$\d|\d+\+? (countries|tools|coins|cryptocurrencies)|private port|-session-/i);
    }
  });

  it('ships a generated catalogue and manifests that match the code (run npm run build:manifest after changing a tool)', () => {
    const read = (file: string) => JSON.parse(readFileSync(join(__dirname, '..', file), 'utf8'));
    const { version } = read('package.json');
    const catalogue = read('tools.json') as Array<{ name: string; title: string; readOnly: boolean; destructive: boolean; description: string }>;

    expect(catalogue.map(row => row.name)).toEqual(everyDefinition.map(t => t.name));
    for (const row of catalogue) {
      const tool = everyDefinition.find(t => t.name === row.name)!;
      expect(row.title).toBe(tool.annotations.title);
      expect(row.readOnly).toBe(tool.annotations.readOnlyHint);
      expect(row.destructive).toBe(tool.annotations.destructiveHint);
      expect(tool.description.startsWith(row.description), row.name).toBe(true);
    }

    expect(read('manifest.json').version).toBe(version);
    expect(read('server.json').version).toBe(version);
    expect(read('server.json').packages[0].version).toBe(version);
    for (const doc of ['README.md', 'SKILL.md', 'llm.txt']) {
      expect(readFileSync(join(__dirname, '..', doc), 'utf8'), doc).toContain(`Generated from the code of version ${version}`);
    }
  });

  it('counts the same tools as the monorepo publish check (it counts name: \' in the source)', () => {
    const count = (file: string) => (readFileSync(file, 'utf8').match(/name:\s*'/g) || []).length;
    const toolsDir = join(__dirname, '..', 'src', 'tools');
    const apiKeyCount = readdirSync(toolsDir)
      .filter(file => file.endsWith('.ts') && file !== 'index.ts')
      .reduce((sum, file) => sum + count(join(toolsDir, file)), 0);

    expect(apiKeyCount).toBe(allToolDefinitions.length);
    expect(count(join(__dirname, '..', 'src', 'x402', 'tools.ts'))).toBe(x402ToolDefinitions.length);
  });

  it('refuses a portId that is not a 24-character ID before any request (the API answers 500 to one)', () => {
    const schemas = allSchemas as Record<string, { safeParse: (data: unknown) => { success: boolean; error?: { issues: unknown[] } } }>;
    const portTools = allToolDefinitions.filter(tool => 'portId' in tool.inputSchema.properties && !tool.name.includes('x402'));
    expect(portTools).toHaveLength(17);
    for (const tool of portTools) {
      const refused = schemas[tool.name].safeParse({ portId: 'Proxy #7' });
      expect(refused.success, tool.name).toBe(false);
      expect(JSON.stringify(refused.error?.issues), tool.name).toContain('list_ports');
    }
    expect(schemas.get_port.safeParse({ portId: '0123456789abcdef01234567' }).success).toBe(true);
  });
});
