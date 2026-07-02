#!/usr/bin/env node
/**
 * Tolerant wrapper for the monorepo docs-manifest sync check.
 *
 * Inside the proxies.sx monorepo, ../agents-landing/scripts/check-manifest-sync.mjs
 * validates the MCP tool count against agents-landing/docs-manifest.json.
 * For standalone GitHub clones of this package that file does not exist,
 * so we skip gracefully instead of failing the build/publish.
 */
const { existsSync } = require('fs');
const { resolve } = require('path');
const { spawnSync } = require('child_process');

const checker = resolve(__dirname, '..', '..', 'agents-landing', 'scripts', 'check-manifest-sync.mjs');

if (!existsSync(checker)) {
  console.log('check:sync skipped: monorepo file not found (' + checker + ').');
  console.log('This is expected for standalone clones of the MCP server package.');
  process.exit(0);
}

const result = spawnSync(process.execPath, [checker], { stdio: 'inherit' });
process.exit(result.status === null ? 1 : result.status);
