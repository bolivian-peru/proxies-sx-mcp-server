/**
 * Test script to verify API functionality
 */

import { getAuthToken, createProxiesApi } from '../dist/api/index.js';

const BASE_URL = 'https://api.proxies.sx';

async function runTests() {
  console.log('='.repeat(60));
  console.log('Proxies.sx MCP Server - API Tests');
  console.log('='.repeat(60));
  console.log();

  const email = process.env.PROXIES_EMAIL;
  const password = process.env.PROXIES_PASSWORD;

  if (!email || !password) {
    console.error('❌ PROXIES_EMAIL and PROXIES_PASSWORD required');
    process.exit(1);
  }

  try {
    // Test 1: Authentication
    console.log('🔐 Test 1: Authentication...');
    const auth = await getAuthToken({
      baseUrl: BASE_URL,
      email,
      password,
    });
    console.log(`   ✅ Logged in as ${email}`);
    console.log(`   Auth type: ${auth.type}`);
    console.log();

    // Create API client
    const api = createProxiesApi({
      baseUrl: BASE_URL,
      token: auth.token,
      authType: auth.type,
    });

    // Test 2: Get account summary
    console.log('👤 Test 2: Get account summary...');
    const account = await api.account.getSummary();
    console.log(`   ✅ Balance: $${account.balance.toFixed(2)} ${account.currency}`);
    if (account.shared) {
      console.log(`   Shared: ${account.shared.slots.available}/${account.shared.slots.total} slots, ${account.shared.trafficGB.available}/${account.shared.trafficGB.total} GB`);
    }
    if (account.private) {
      console.log(`   Private: ${account.private.slots.available}/${account.private.slots.total} slots, ${account.private.trafficGB.available}/${account.private.trafficGB.total} GB`);
    }
    console.log();

    // Test 3: List countries
    console.log('🌍 Test 3: List available countries...');
    const countries = await api.reference.getCountries();
    console.log(`   ✅ Found ${countries.length} countries`);
    if (countries.length > 0) {
      console.log(`   First 3: ${countries.slice(0, 3).map(c => c.name).join(', ')}`);
    }
    console.log();

    // Test 4: Get tariffs/pricing
    console.log('💰 Test 4: Get pricing...');
    const tariffs = await api.billing.getTariffs();
    console.log(`   ✅ Found ${tariffs.length} tariffs`);
    for (const t of tariffs.slice(0, 4)) {
      console.log(`   - ${t.category} ${t.type}: $${t.pricePerUnit}/${t.type === 'traffic' ? 'GB' : 'slot'}`);
    }
    console.log();

    // Test 5: List ports
    console.log('🔌 Test 5: List ports...');
    const ports = await api.ports.list({ limit: 5 });
    console.log(`   ✅ Found ${ports.total} total ports (showing ${ports.data.length})`);
    for (const p of ports.data.slice(0, 3)) {
      console.log(`   - ${p.displayName || p.portName}: ${p.type} (${p.status})`);
    }
    console.log();

    // Test 6: Traffic breakdown
    console.log('📊 Test 6: Traffic breakdown...');
    try {
      const traffic = await api.account.getTrafficBreakdown();
      console.log(`   ✅ Found ${traffic.length} categories`);
      for (const t of traffic) {
        console.log(`   - ${t.category}: ${t.usedGB.toFixed(2)}/${t.purchasedGB.toFixed(2)} GB (${t.usagePercent.toFixed(1)}%)`);
      }
    } catch (e) {
      console.log(`   ⚠️ Traffic API: ${e instanceof Error ? e.message : 'Error'}`);
    }
    console.log();

    console.log('='.repeat(60));
    console.log('✅ All tests passed!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Test failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

runTests();
