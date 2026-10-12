#!/usr/bin/env node
/**
 * Generates, from package.json + the compiled tool definitions, everything
 * that lists the tools, so none of it can drift from the code:
 *
 *   manifest.json  MCPB / Claude Desktop extension manifest
 *   tools.json     machine-readable catalogue (the portal page renders it)
 *   README.md, SKILL.md, llm.txt   the block between the tools:start/end markers
 *
 * Run after `npm run build`:  npm run build:manifest
 *
 * Spec: https://github.com/anthropics/mcpb/blob/main/MANIFEST.md
 */
const { readFileSync, writeFileSync } = require('fs');
const { resolve } = require('path');

const root = resolve(__dirname, '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'));
const { toolGroups, PUBLIC_TOOL_NAMES } = require(resolve(root, 'dist', 'tools', 'index.js'));
const { x402ToolDefinitions } = require(resolve(root, 'dist', 'x402', 'tools.js'));

const WALLET_CATEGORY = 'x402 wallet (optional, no account)';
const firstSentence = (text) => text.split(/(?<=\.)\s/)[0];

/** One row per registered tool. mode: where it is listed (public = every mode). */
function catalogueRow(tool, category, mode) {
  if (!tool.annotations) {
    console.error(`Tool without annotations: ${tool.name}`);
    process.exit(1);
  }
  const required = tool.inputSchema.required || [];
  return {
    name: tool.name,
    category,
    title: tool.annotations.title,
    description: firstSentence(tool.description),
    readOnly: tool.annotations.readOnlyHint,
    destructive: tool.annotations.destructiveHint,
    mode,
    params: Object.keys(tool.inputSchema.properties || {}).map((name) => ({ name, required: required.includes(name) })),
  };
}

const apiTools = toolGroups.flatMap((group) => group.tools);
const catalogue = [
  ...toolGroups.flatMap((group) =>
    group.tools.map((tool) => catalogueRow(tool, group.category, PUBLIC_TOOL_NAMES.includes(tool.name) ? 'public' : 'apiKey'))),
  ...x402ToolDefinitions.map((tool) => catalogueRow(tool, WALLET_CATEGORY, 'x402')),
];

writeFileSync(resolve(root, 'tools.json'), JSON.stringify(catalogue, null, 2) + '\n');

const manifest = {
  manifest_version: '0.3',
  name: 'proxies-sx-mcp-server',
  display_name: 'Proxies.sx',
  version: pkg.version,
  description: `Residential and mobile proxies for AI agents: Pool Gateway URLs, live stock per country, Private Pools and Reserved IPs, dedicated ports, billing and support. ${apiTools.length} tools with an API key, ${x402ToolDefinitions.length} more with an agent wallet.`,
  long_description:
    'Use Proxies.sx metered residential and mobile proxy bandwidth from Claude. ' +
    'The Pool Gateway (gw.proxies.sx, HTTP 7000 / SOCKS5 7001) is one endpoint with routing in the username: ' +
    'the peer pool covers most countries, the mbl pool is carrier modems in US, GB, FR, NL, PL and GE (Georgia). ' +
    'You pay per GB with a volume discount; time is free (the get_pricing tool reads the live price). ' +
    'Set PROXIES_API_KEY (create a key at https://client.proxies.sx/account) for the standard account path. ' +
    'AGENT_WALLET_KEY is the optional x402 path: pay per GB in USDC without an account.',
  author: { name: pkg.author, email: 'maya@proxies.sx', url: pkg.homepage },
  repository: pkg.repository,
  homepage: 'https://agents.proxies.sx/',
  documentation: 'https://agents.proxies.sx/pool/skill.md',
  support: pkg.bugs.url,
  server: {
    type: 'node',
    entry_point: 'dist/index.js',
    mcp_config: {
      command: 'node',
      args: ['${__dirname}/dist/index.js'],
      env: {
        PROXIES_API_KEY: '${user_config.api_key}',
        AGENT_WALLET_KEY: '${user_config.agent_wallet_key}',
      },
    },
  },
  tools: catalogue.map(({ name, description }) => ({ name, description })),
  tools_generated: false,
  keywords: pkg.keywords,
  license: pkg.license,
  privacy_policies: ['https://www.proxies.sx/privacy'],
  compatibility: {
    claude_desktop: '>=1.0.0',
    platforms: ['darwin', 'win32', 'linux'],
    runtimes: { node: '>=18' },
  },
  user_config: {
    api_key: {
      type: 'string',
      title: 'Proxies.sx API key',
      description: 'psx_ key created at https://client.proxies.sx/account. Standard mode: the GB on your account pay for traffic.',
      sensitive: true,
      required: false,
    },
    agent_wallet_key: {
      type: 'string',
      title: 'Agent wallet private key (x402)',
      description: 'Private key (0x...) of a USDC wallet on the Base network. Optional: pays per GB via x402 without a Proxies.sx account.',
      sensitive: true,
      required: false,
    },
  },
};

writeFileSync(resolve(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

/** The tool list as Markdown, one table per category. */
function toolListMarkdown() {
  const lines = [`Generated from the code of version ${pkg.version} by \`npm run build:manifest\`. Do not edit by hand.`];
  let category;
  for (const row of catalogue) {
    if (row.category !== category) {
      category = row.category;
      lines.push('', `**${category}**`, '', '| Tool | What it does |', '|---|---|');
    }
    const note = row.mode === 'public' ? ' Also listed in wallet mode.' : '';
    lines.push(`| \`${row.name}\` | ${row.description}${note} |`);
  }
  return lines.join('\n');
}

const START = '<!-- tools:start -->';
const END = '<!-- tools:end -->';
for (const file of ['README.md', 'SKILL.md', 'llm.txt']) {
  const path = resolve(root, file);
  const text = readFileSync(path, 'utf-8');
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  if (start === -1 || end === -1) {
    console.error(`${file}: tools:start / tools:end markers not found`);
    process.exit(1);
  }
  writeFileSync(path, `${text.slice(0, start + START.length)}\n${toolListMarkdown()}\n${text.slice(end)}`);
}

console.log(`v${pkg.version}: ${apiTools.length} API-key tools (${PUBLIC_TOOL_NAMES.length} of them public) + ${x402ToolDefinitions.length} wallet tools -> manifest.json, tools.json, README.md, SKILL.md, llm.txt`);
