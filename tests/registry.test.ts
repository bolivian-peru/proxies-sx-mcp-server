import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';
import { createMcpServer } from '../src/server.js';
import { allToolDefinitions, allSchemas, toolGroups, PUBLIC_TOOL_NAMES } from '../src/tools/index.js';
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
    const { toolHandlers, toolDefinitions } = await createMcpServer({ apiKey: API_KEY, walletPrivateKey: WALLET_KEY });
    expect(toolDefinitions.map(t => t.name).sort()).toEqual(everyDefinition.map(t => t.name).sort());
    expect(Object.keys(toolHandlers).sort()).toEqual(everyDefinition.map(t => t.name).sort());
    for (const tool of toolDefinitions) {
      expect(typeof toolHandlers[tool.name], tool.name).toBe('function');
    }
  });

  it('lists the API tools with an API key, and the public plus wallet tools with a wallet only', async () => {
    const apiKeyMode = await createMcpServer({ apiKey: API_KEY });
    expect(apiKeyMode.toolDefinitions.map(t => t.name)).toEqual(allToolDefinitions.map(t => t.name));

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
      'reconfigure_port',
      'replace_x402_port',
      'reserved_ip_release',
      'reserved_ip_rotate',
      'rotate_port',
      'x402_pool_regenerate',
      'x402_rotate_ip',
    ]);
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
