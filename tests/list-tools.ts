/**
 * Test script to list all available tools
 */

import { allToolDefinitions } from '../src/tools/index.js';

console.log('='.repeat(60));
console.log('Proxies.sx MCP Server - Available Tools');
console.log('='.repeat(60));
console.log();

console.log(`Total tools: ${allToolDefinitions.length}`);
console.log();

// Group tools by category
const categories: Record<string, typeof allToolDefinitions[number][]> = {
  'Account': [],
  'Port Management': [],
  'Port Status': [],
  'Rotation': [],
  'Billing': [],
  'Reference': [],
  'Utilities': [],
};

for (const tool of allToolDefinitions) {
  if (tool.name.startsWith('get_account') || tool.name === 'get_account_summary') {
    categories['Account'].push(tool);
  } else if (tool.name.includes('port') && !tool.name.includes('status') && !tool.name.includes('ip') && !tool.name.includes('ping') && !tool.name.includes('speed') && !tool.name.includes('rotat')) {
    categories['Port Management'].push(tool);
  } else if (tool.name.includes('status') || tool.name.includes('_ip') || tool.name.includes('ping') || tool.name.includes('speed')) {
    categories['Port Status'].push(tool);
  } else if (tool.name.includes('rotat')) {
    categories['Rotation'].push(tool);
  } else if (tool.name.includes('purchas') || tool.name.includes('pricing')) {
    categories['Billing'].push(tool);
  } else if (tool.name.includes('list_') && (tool.name.includes('countr') || tool.name.includes('carrier') || tool.name.includes('cit') || tool.name.includes('region'))) {
    categories['Reference'].push(tool);
  } else {
    categories['Utilities'].push(tool);
  }
}

for (const [category, tools] of Object.entries(categories)) {
  if (tools.length === 0) continue;

  console.log(`## ${category}`);
  console.log('-'.repeat(40));

  for (const tool of tools) {
    console.log(`  ${tool.name}`);
    console.log(`    ${tool.description}`);

    const required = tool.inputSchema.required as string[];
    const props = Object.keys(tool.inputSchema.properties || {});

    if (props.length > 0) {
      console.log(`    Parameters: ${props.join(', ')}`);
      if (required.length > 0) {
        console.log(`    Required: ${required.join(', ')}`);
      }
    }
    console.log();
  }
}

console.log('='.repeat(60));
console.log('MCP Server ready for Claude Desktop integration');
console.log('='.repeat(60));
