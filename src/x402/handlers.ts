/**
 * x402 MCP Tool Handlers
 * Implementation of x402 tool logic
 */

import type { X402Client } from './client.js';
import type { AgentWallet } from './wallet.js';
import type { X402SessionCache } from './session-cache.js';
import type { X402Tier } from './types.js';

/**
 * Structured error response for tool handlers
 */
function toolError(tool: string, message: string, retryable: boolean, suggestion?: string): string {
  return JSON.stringify({
    error: true,
    tool,
    message,
    retryable,
    suggestion: suggestion || (retryable ? 'Wait a moment and retry' : 'Check parameters and try again'),
  });
}

/**
 * Pricing rates by tier - Duration is FREE, pay only for traffic.
 * Platform is per-GB metered only: $4/GB. The legacy private/dedicated
 * tier was removed; `private` is retained at the type level only.
 */
const PRICING_RATES: Record<X402Tier, { perGB: number }> = {
  shared: { perGB: 4.0 },
  private: { perGB: 4.0 },
};

/**
 * Create x402 tool handlers
 */
export function createX402ToolHandlers(
  client: X402Client,
  wallet: AgentWallet,
  cache: X402SessionCache,
  apiBaseUrl: string
) {
  return {
    /**
     * Purchase proxy via x402 payment
     */
    async x402_get_proxy(args: {
      country: string;
      duration_hours?: number;
      traffic_gb?: number;
      tier?: X402Tier;
      city?: string;
      carrier?: string;
    }): Promise<string> {
      const durationHours = args.duration_hours || 1;
      const trafficGB = args.traffic_gb || 1;
      const tier = args.tier || 'shared';

      try {
        // Check balance first
        const balance = await wallet.getBalance();
        const balanceNum = Number(balance.usdc) / 1e6;

        // Calculate expected cost - duration is FREE, only pay for traffic
        const rates = PRICING_RATES[tier];
        const expectedCost = trafficGB * rates.perGB;

        if (balanceNum < expectedCost) {
          return [
            `Insufficient USDC balance!`,
            ``,
            `Required: ~$${expectedCost.toFixed(2)} USDC`,
            `Available: ${balance.formatted}`,
            ``,
            `Please top up your wallet on Base network:`,
            wallet.address,
            ``,
            `Send USDC on Base to continue.`,
          ].join('\n');
        }

        // Execute purchase
        const result = await client.purchaseProxy({
          country: args.country,
          durationHours,
          trafficGB,
          tier,
          city: args.city,
          carrier: args.carrier,
        });

        // Cache session locally
        cache.addSessionFromResponse({
          session: result.session,
          rotationUrl: result.session.rotationUrl,
          rotationToken: result.session.rotationToken,
        });

        // Build connection strings
        const { proxy } = result.session;
        const httpUrl = `http://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.httpPort}`;
        const socksUrl = `socks5://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.socksPort}`;

        const expiresAt = new Date(result.session.expiresAt);
        const expiresDisplay = expiresAt.toLocaleString();

        return [
          `Proxy purchased successfully!`,
          ``,
          `--- Connection Details ---`,
          `HTTP:   ${httpUrl}`,
          `SOCKS5: ${socksUrl}`,
          ``,
          `--- Session Info ---`,
          `Session ID: ${result.session.id}`,
          `Location: ${result.session.location.country || result.session.location.countryCode}`,
          `Expires: ${expiresDisplay}`,
          `Traffic: ${result.session.traffic.allowedGB} GB`,
          ``,
          `--- Payment ---`,
          `Amount: $${result.payment.amountPaid} USDC`,
          `Network: ${result.payment.network}`,
          `TX Hash: ${result.payment.transactionHash}`,
          ``,
          `--- Usage ---`,
          `Environment variables:`,
          `  HTTP_PROXY=${httpUrl}`,
          `  HTTPS_PROXY=${httpUrl}`,
          ``,
          `Rotation URL: ${result.session.rotationUrl}`,
        ].join('\n');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const isBalance = message.toLowerCase().includes('insufficient') || message.toLowerCase().includes('balance');
        return toolError(
          'x402_get_proxy',
          message,
          !isBalance,
          isBalance ? `Top up your wallet with USDC on Base: ${wallet.address}` : 'Check country code and retry',
        );
      }
    },

    /**
     * Get pricing information
     */
    async x402_get_pricing(args: {
      traffic_gb?: number;
      tier?: X402Tier;
    }): Promise<string> {
      const trafficGB = args.traffic_gb || 1;
      const tier = args.tier || 'shared';

      const rates = PRICING_RATES[tier];
      const total = trafficGB * rates.perGB;

      // Get current balance
      let balanceInfo = '';
      try {
        const balance = await wallet.getBalance();
        balanceInfo = `\nYour wallet: ${balance.formatted}`;
        const balanceNum = Number(balance.usdc) / 1e6;
        if (balanceNum >= total) {
          balanceInfo += ` (sufficient)`;
        } else {
          balanceInfo += ` (need $${(total - balanceNum).toFixed(2)} more)`;
        }
      } catch {
        // Ignore balance check errors
      }

      return [
        `x402 Proxy Pricing`,
        ``,
        `Tier: ${tier}`,
        `Duration: FREE (included)`,
        `Traffic: ${trafficGB} GB x $${rates.perGB.toFixed(2)}/GB = $${total.toFixed(2)}`,
        `${'─'.repeat(40)}`,
        `Total: $${total.toFixed(2)} USDC`,
        balanceInfo,
        ``,
        `Rate (duration is always FREE): $4.00/GB, metered.`,
        `The platform is per-GB metered only - the legacy private/dedicated tier was removed.`,
        ``,
        `Min purchase: 0.1 GB ($0.40)`,
      ].join('\n');
    },

    /**
     * List active sessions
     */
    async x402_list_sessions(): Promise<string> {
      const sessions = cache.getActiveSessions();

      if (sessions.length === 0) {
        return [
          `No active x402 sessions.`,
          ``,
          `Use x402_get_proxy to purchase a new proxy.`,
          `Example: x402_get_proxy(country: "US", duration_hours: 1, traffic_gb: 1)`,
        ].join('\n');
      }

      const lines = [`Active x402 Sessions (${sessions.length}):`, ``];

      for (const session of sessions) {
        const timeRemaining = cache.getTimeRemaining(session.id);
        const expiresDisplay = timeRemaining?.display || 'Unknown';

        lines.push(`Session: ${session.id}`);
        lines.push(`  Location: ${session.location.country || session.location.countryCode}`);
        lines.push(`  Expires in: ${expiresDisplay}`);
        lines.push(`  HTTP Port: ${session.proxy.host}:${session.proxy.httpPort}`);
        lines.push(`  SOCKS Port: ${session.proxy.host}:${session.proxy.socksPort}`);
        lines.push(``);
      }

      lines.push(`Use x402_check_session for detailed status.`);

      return lines.join('\n');
    },

    /**
     * Check session status
     */
    async x402_check_session(args: { session_id?: string }): Promise<string> {
      // Get session from cache
      let session = args.session_id
        ? cache.getSession(args.session_id)
        : cache.getFirstActiveSession();

      if (!session) {
        if (args.session_id) {
          return `Session not found: ${args.session_id}. Use x402_list_sessions to see available sessions.`;
        }
        return `No active sessions. Use x402_get_proxy to purchase a new proxy.`;
      }

      // Try to get fresh status from API
      let freshStatus;
      try {
        freshStatus = await client.getSessionStatus(session.id);
      } catch {
        // Use cached data if API fails
      }

      const timeRemaining = cache.getTimeRemaining(session.id);
      const expiresAt = new Date(session.expiresAt);

      // Build connection URLs
      const httpUrl = `http://${session.proxy.username}:${session.proxy.password}@${session.proxy.host}:${session.proxy.httpPort}`;
      const socksUrl = `socks5://${session.proxy.username}:${session.proxy.password}@${session.proxy.host}:${session.proxy.socksPort}`;

      const lines = [
        `Session Status`,
        ``,
        `ID: ${session.id}`,
        `Status: ${freshStatus?.status || (timeRemaining && timeRemaining.seconds > 0 ? 'active' : 'expired')}`,
        `Location: ${session.location.country || session.location.countryCode}`,
        ``,
        `--- Time ---`,
        `Expires: ${expiresAt.toLocaleString()}`,
        `Remaining: ${timeRemaining?.display || 'Unknown'}`,
      ];

      // Add traffic info if available from API
      if (freshStatus?.traffic) {
        lines.push(``);
        lines.push(`--- Traffic ---`);
        lines.push(`Allowed: ${freshStatus.traffic.allowedGB} GB`);
        lines.push(`Used: ${freshStatus.traffic.usedGB?.toFixed(2) || '0.00'} GB`);
        lines.push(`Remaining: ${freshStatus.traffic.remainingGB?.toFixed(2) || freshStatus.traffic.allowedGB} GB`);
        if (freshStatus.traffic.percentUsed !== undefined) {
          lines.push(`Usage: ${freshStatus.traffic.percentUsed.toFixed(1)}%`);
        }
      }

      lines.push(``);
      lines.push(`--- Connection ---`);
      lines.push(`HTTP: ${httpUrl}`);
      lines.push(`SOCKS5: ${socksUrl}`);
      lines.push(``);
      lines.push(`--- Credentials ---`);
      lines.push(`Host: ${session.proxy.host}`);
      lines.push(`HTTP Port: ${session.proxy.httpPort}`);
      lines.push(`SOCKS Port: ${session.proxy.socksPort}`);
      lines.push(`Username: ${session.proxy.username}`);
      lines.push(`Password: ${session.proxy.password}`);

      if (session.rotationUrl) {
        lines.push(``);
        lines.push(`--- Rotation ---`);
        lines.push(`URL: ${session.rotationUrl}`);
      }

      return lines.join('\n');
    },

    /**
     * Check wallet balance
     */
    async x402_wallet_balance(): Promise<string> {
      try {
        const info = await wallet.getInfo();

        return [
          `x402 Wallet Balance`,
          ``,
          `Address: ${info.address}`,
          `Network: Base (Ethereum L2)`,
          ``,
          `USDC Balance: ${info.usdcBalance.formatted}`,
          `ETH Balance: ${info.ethBalance} (for gas)`,
          ``,
          `To top up, send USDC on Base network to:`,
          info.address,
          ``,
          `Base network has low gas fees (~$0.01 per transaction).`,
        ].join('\n');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return toolError('x402_wallet_balance', message, true, 'Check network connection and retry');
      }
    },

    /**
     * Rotate proxy IP
     */
    async x402_rotate_ip(args: { session_id?: string }): Promise<string> {
      // Get session
      const session = args.session_id
        ? cache.getSession(args.session_id)
        : cache.getFirstActiveSession();

      if (!session) {
        if (args.session_id) {
          return `Session not found: ${args.session_id}`;
        }
        return `No active sessions. Use x402_get_proxy to purchase a new proxy first.`;
      }

      if (!session.rotationUrl) {
        return `Rotation URL not available for session ${session.id}`;
      }

      try {
        // Call rotation URL
        const response = await fetch(session.rotationUrl);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: 'Unknown error' })) as { message?: string };
          throw new Error(errorData.message || `HTTP ${response.status}`);
        }

        const result = await response.json() as { newIp?: string; newDevice?: { carrier?: string } };

        return [
          `IP Rotated Successfully!`,
          ``,
          `Session: ${session.id}`,
          result.newIp ? `New IP: ${result.newIp}` : '',
          result.newDevice ? `New Device: ${result.newDevice.carrier || 'Unknown carrier'}` : '',
          ``,
          `Your proxy connection details remain the same.`,
          `The new IP is now active.`,
        ]
          .filter(Boolean)
          .join('\n');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return toolError('x402_rotate_ip', message, true, 'Wait 5 minutes (cooldown) then retry');
      }
    },

    /**
     * List available countries
     */
    async x402_list_countries(): Promise<string> {
      try {
        const response = await fetch(`${apiBaseUrl}/v1/countries`);
        if (!response.ok) {
          throw new Error(`Failed to fetch countries: ${response.status}`);
        }

        const countries = await response.json() as Array<{ code: string; name: string; isActive?: boolean }>;

        if (!countries || countries.length === 0) {
          return 'No countries available at this time.';
        }

        const lines = [
          `Available Countries (${countries.length}):`,
          ``,
          `Code | Country Name`,
          `${'─'.repeat(40)}`,
        ];

        for (const country of countries) {
          if (country.isActive !== false) {
            lines.push(`${country.code.padEnd(4)} | ${country.name}`);
          }
        }

        lines.push(``);
        lines.push(`Use x402_get_proxy(country: "CODE") to purchase a proxy.`);
        lines.push(`Use x402_list_cities(country: "CODE") for city options.`);

        return lines.join('\n');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return toolError('x402_list_countries', message, true);
      }
    },

    /**
     * List cities in a country
     */
    async x402_list_cities(args: { country: string }): Promise<string> {
      try {
        const response = await fetch(`${apiBaseUrl}/v1/cities?country=${args.country.toUpperCase()}`);
        if (!response.ok) {
          if (response.status === 404) {
            return `No cities found for country: ${args.country}`;
          }
          throw new Error(`Failed to fetch cities: ${response.status}`);
        }

        const cities = await response.json() as Array<{ code?: string; name: string }>;

        if (!cities || cities.length === 0) {
          return `No specific cities available for ${args.country}. You can still use x402_get_proxy without specifying a city.`;
        }

        const lines = [
          `Available Cities in ${args.country.toUpperCase()} (${cities.length}):`,
          ``,
        ];

        for (const city of cities) {
          lines.push(`• ${city.name}${city.code ? ` (${city.code})` : ''}`);
        }

        lines.push(``);
        lines.push(`Use x402_get_proxy(country: "${args.country}", city: "CITY_NAME") to target a specific city.`);

        return lines.join('\n');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return toolError('x402_list_cities', message, true);
      }
    },

    /**
     * List carriers in a country
     */
    async x402_list_carriers(args: { country: string }): Promise<string> {
      try {
        const response = await fetch(`${apiBaseUrl}/v1/carriers?country=${args.country.toUpperCase()}`);
        if (!response.ok) {
          if (response.status === 404) {
            return `No carriers found for country: ${args.country}`;
          }
          throw new Error(`Failed to fetch carriers: ${response.status}`);
        }

        const carriers = await response.json() as Array<{ code?: string; name: string }>;

        if (!carriers || carriers.length === 0) {
          return `No specific carriers available for ${args.country}. You can still use x402_get_proxy without specifying a carrier.`;
        }

        const lines = [
          `Available Carriers in ${args.country.toUpperCase()} (${carriers.length}):`,
          ``,
        ];

        for (const carrier of carriers) {
          lines.push(`• ${carrier.name}${carrier.code ? ` (${carrier.code})` : ''}`);
        }

        lines.push(``);
        lines.push(`Use x402_get_proxy(country: "${args.country}", carrier: "CARRIER_NAME") to target a specific carrier.`);

        return lines.join('\n');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return toolError('x402_list_carriers', message, true);
      }
    },

    /**
     * Buy Pool Gateway access with USDC (one credential, every country in tier)
     */
    async x402_get_pool_access(args: {
      country?: string;
      traffic_gb?: number;
      tier?: string;
      sid?: string;
      rot?: string;
    }): Promise<string> {
      const trafficGB = args.traffic_gb || 1;
      const tier = args.tier || 'mbl';

      try {
        // Check balance vs expected cost ($4/GB for mbl)
        const balance = await wallet.getBalance();
        const balanceNum = Number(balance.usdc) / 1e6;
        const expectedCost = trafficGB * 4.0;

        if (balanceNum < expectedCost) {
          return [
            `Insufficient USDC balance!`,
            ``,
            `Required: ~$${expectedCost.toFixed(2)} USDC (${trafficGB} GB x $4.00/GB)`,
            `Available: ${balance.formatted}`,
            ``,
            `Top up your wallet, then retry:`,
            wallet.address,
          ].join('\n');
        }

        const result = await client.purchasePoolAccess({
          country: args.country,
          trafficGB,
          tier,
          sid: args.sid,
          rot: args.rot,
        });

        // Cache the session token for follow-up pool tools
        if (result.sessionToken) {
          cache.setPoolToken(result.sessionToken);
        }

        const { proxy, credit } = result;
        const httpUrl = proxy.http
          || `http://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.httpPort}`;

        const lines = [
          `Pool Gateway access purchased!`,
          ``,
          `ONE credential reaches every country in your tier via the username DSL`,
          `(e.g. ${proxy.username}-mbl-us, -mbl-de, ...). HTTP proxy on port ${proxy.httpPort} only.`,
          ``,
          `--- Connection ---`,
          `HTTP: ${httpUrl}`,
          `Host: ${proxy.host}`,
          `Port: ${proxy.httpPort}`,
          `Username: ${proxy.username}`,
          `Password: ${proxy.password}`,
        ];
        if (proxy.usernameTemplate) {
          lines.push(`Username template: ${proxy.usernameTemplate}`);
        }
        lines.push(
          ``,
          `--- Credit (pak-backed) ---`,
          `Tier: ${credit.tier || tier} ($4/GB, metered, production modems)`,
          `Allocated: ${credit.allocatedGB} GB`,
          `Used: ${credit.usedGB} GB`,
          `Remaining: ${credit.remainingGB} GB`,
        );
        if (credit.expiresAt) lines.push(`Expires: ${new Date(credit.expiresAt).toLocaleString()}`);
        lines.push(
          ``,
          `--- Session ---`,
          `Session token (cached): ${result.sessionToken}`,
        );
        if (result.payment) {
          lines.push(``, `--- Payment ---`);
          if (result.payment.amountUSDC !== undefined) lines.push(`Amount: $${result.payment.amountUSDC} USDC`);
          if (result.payment.network) lines.push(`Network: ${result.payment.network}`);
          if (result.payment.transactionHash) lines.push(`TX: ${result.payment.transactionHash}`);
        }
        lines.push(
          ``,
          `Note: sticky pins the MODEM, not the IP - carrier NAT may still re-issue the egress IP.`,
        );
        if (result.caveats && result.caveats.length > 0) {
          lines.push(``, ...result.caveats.map((c) => `- ${c}`));
        }

        return lines.join('\n');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const isBalance = message.toLowerCase().includes('insufficient');
        return toolError(
          'x402_get_pool_access',
          message,
          !isBalance,
          isBalance ? `Top up your wallet with USDC: ${wallet.address}` : 'Check tier/country and retry',
        );
      }
    },

    /**
     * Check remaining pool credit
     */
    async x402_pool_credit(args: { session_token?: string }): Promise<string> {
      const token = args.session_token || cache.getPoolToken();
      if (!token) {
        return `No pool session token provided or cached. Buy pool access first with x402_get_pool_access.`;
      }
      try {
        const credit = await client.getPoolCredit(token);
        return [
          `Pool Gateway Credit`,
          ``,
          `Tier: ${credit.tier || 'mbl'}`,
          `Allocated: ${credit.allocatedGB} GB`,
          `Used: ${credit.usedGB} GB`,
          `Remaining: ${credit.remainingGB} GB`,
          `Status: ${credit.enabled ? 'enabled' : 'suspended (cap reached or disabled)'}`,
          credit.expiresAt ? `Expires: ${new Date(credit.expiresAt).toLocaleString()}` : '',
        ].filter(Boolean).join('\n');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return toolError('x402_pool_credit', message, true);
      }
    },

    /**
     * Top up a pool session with more GB and/or duration
     */
    async x402_pool_topup(args: {
      session_token?: string;
      add_traffic_gb?: number;
      add_duration_seconds?: number;
    }): Promise<string> {
      const token = args.session_token || cache.getPoolToken();
      if (!token) {
        return `No pool session token provided or cached. Buy pool access first with x402_get_pool_access.`;
      }
      if (!args.add_traffic_gb && !args.add_duration_seconds) {
        return `Specify add_traffic_gb (paid, $4/GB) and/or add_duration_seconds (free).`;
      }
      try {
        if (args.add_traffic_gb && args.add_traffic_gb > 0) {
          const cost = args.add_traffic_gb * 4.0;
          const balance = await wallet.getBalance();
          const balanceNum = Number(balance.usdc) / 1e6;
          if (balanceNum < cost) {
            return [
              `Insufficient USDC balance for top-up!`,
              ``,
              `Required: ~$${cost.toFixed(2)} USDC (${args.add_traffic_gb} GB x $4.00/GB)`,
              `Available: ${balance.formatted}`,
              ``,
              `Top up your wallet, then retry: ${wallet.address}`,
            ].join('\n');
          }
        }

        const credit = await client.topUpPool(token, {
          addTrafficGB: args.add_traffic_gb,
          addDurationSeconds: args.add_duration_seconds,
        });

        const isFree = !args.add_traffic_gb || args.add_traffic_gb <= 0;
        return [
          `Pool Session Topped Up!`,
          ``,
          isFree ? `Added duration (free).` : `Added ${args.add_traffic_gb} GB ($${(args.add_traffic_gb! * 4).toFixed(2)} USDC).`,
          args.add_duration_seconds ? `Added duration: ${args.add_duration_seconds}s (free).` : '',
          ``,
          `--- Updated Credit ---`,
          `Allocated: ${credit.allocatedGB} GB`,
          `Used: ${credit.usedGB} GB`,
          `Remaining: ${credit.remainingGB} GB`,
          credit.expiresAt ? `Expires: ${new Date(credit.expiresAt).toLocaleString()}` : '',
        ].filter(Boolean).join('\n');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return toolError('x402_pool_topup', message, true);
      }
    },

    /**
     * Rotate the pool credential secret (same username, new password)
     */
    async x402_pool_regenerate(args: { session_token?: string }): Promise<string> {
      const token = args.session_token || cache.getPoolToken();
      if (!token) {
        return `No pool session token provided or cached. Buy pool access first with x402_get_pool_access.`;
      }
      try {
        const result = await client.regeneratePool(token);
        const { proxy } = result;
        const httpUrl = proxy.http
          || `http://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.httpPort}`;
        return [
          `Pool Credential Rotated!`,
          ``,
          `Same username, new password.`,
          ``,
          `--- New Connection ---`,
          `HTTP: ${httpUrl}`,
          `Username: ${proxy.username}`,
          `Password: ${proxy.password}`,
        ].join('\n');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return toolError('x402_pool_regenerate', message, true);
      }
    },

    /**
     * Re-emit pool credentials (recovery)
     */
    async x402_pool_connection(args: { session_token?: string }): Promise<string> {
      const token = args.session_token || cache.getPoolToken();
      if (!token) {
        return `No pool session token provided or cached. Buy pool access first with x402_get_pool_access.`;
      }
      try {
        const result = await client.getPoolConnection(token);
        const { proxy } = result;
        const httpUrl = proxy.http
          || `http://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.httpPort}`;
        const lines = [
          `Pool Gateway Connection`,
          ``,
          `HTTP: ${httpUrl}`,
          `Host: ${proxy.host}`,
          `Port: ${proxy.httpPort}`,
          `Username: ${proxy.username}`,
          `Password: ${proxy.password}`,
        ];
        if (proxy.usernameTemplate) lines.push(`Username template: ${proxy.usernameTemplate}`);
        return lines.join('\n');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return toolError('x402_pool_connection', message, true);
      }
    },

    /**
     * Get the Pool Gateway tier catalog (no auth)
     */
    async x402_pool_pricing(): Promise<string> {
      try {
        const pricing = await client.getPoolPricing();
        const lines = [
          `Pool Gateway Pricing`,
          ``,
          `Default tier: ${pricing.defaultTier || 'mbl'}`,
          ``,
          `--- Tiers ---`,
        ];
        for (const t of pricing.tiers || []) {
          const parts = [`${t.tier}: $${t.pricePerGB}/GB, metered`];
          if (t.minPurchaseGB) parts.push(`min ${t.minPurchaseGB} GB`);
          if (t.quality) parts.push(t.quality);
          lines.push(`  ${parts.join(' - ')}`);
        }
        if (pricing.usernameDsl) {
          lines.push(``, `--- Username DSL ---`, pricing.usernameDsl);
        }
        if (pricing.stockUrl) lines.push(``, `Stock: ${pricing.stockUrl}`);
        lines.push(``, `v1 = mbl tier ($4/GB, metered, production modems).`);
        return lines.join('\n');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return toolError('x402_pool_pricing', message, true);
      }
    },

    /**
     * Get public pool stock (counts per country, no IPs)
     */
    async get_pool_stock(): Promise<string> {
      try {
        const stock = await client.getPoolStock();
        return [
          `Pool Gateway Stock (online endpoint counts per country - no IPs)`,
          ``,
          '```json',
          JSON.stringify(stock, null, 2),
          '```',
        ].join('\n');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return toolError('get_pool_stock', message, true);
      }
    },

    /**
     * Check x402 service status
     */
    async x402_service_status(): Promise<string> {
      try {
        const response = await fetch(`${apiBaseUrl}/v1/x402/health`);
        const data = await response.json() as { status: string; enabled: boolean };

        // Also check wallet balance
        let balanceInfo = '';
        try {
          const balance = await wallet.getBalance();
          balanceInfo = `\nWallet Balance: ${balance.formatted}`;
        } catch {
          balanceInfo = '\nWallet Balance: Unable to check';
        }

        // Check active sessions
        const activeSessions = cache.getActiveSessions();
        const sessionsInfo = `\nActive Sessions: ${activeSessions.length}`;

        // Check expiring soon
        const expiringSoon = cache.getExpiringSoon(30);
        const expiringInfo = expiringSoon.length > 0
          ? `\nSessions Expiring Soon: ${expiringSoon.length} (within 30 minutes)`
          : '';

        return [
          `x402 Service Status`,
          ``,
          `API Status: ${data.status === 'ok' ? '✓ Online' : '✗ Offline'}`,
          `x402 Enabled: ${data.enabled ? '✓ Yes' : '✗ No'}`,
          balanceInfo,
          sessionsInfo,
          expiringInfo,
          ``,
          `Wallet Address: ${wallet.address}`,
          `Network: Base (Ethereum L2)`,
        ].filter(Boolean).join('\n');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return [
          `x402 Service Status`,
          ``,
          `API Status: ✗ Unable to connect`,
          `Error: ${message}`,
          ``,
          `Please check your network connection and try again.`,
        ].join('\n');
      }
    },
  };
}

/**
 * Tool handler type
 */
export type X402ToolHandlers = ReturnType<typeof createX402ToolHandlers>;
