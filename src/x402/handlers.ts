/**
 * x402 MCP Tool Handlers
 * Implementation of x402 tool logic. Failures are thrown and reach the
 * server's single tool-error path; prices are read from the API, never
 * written here.
 */

import type { X402Client } from './client.js';
import type { AgentWallet } from './wallet.js';
import type { X402SessionCache } from './session-cache.js';
import type { CachedSession, X402PoolCredit, X402PoolProxy } from './types.js';

const NO_POOL_TOKEN = 'No pool session token given or cached. Buy pool access first with x402_get_pool_access, or pass session_token.';

function proxyUrls(proxy: CachedSession['proxy']) {
  return {
    http: `http://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.httpPort}`,
    socks5: `socks5://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.socksPort}`,
  };
}

function poolConnectionLines(proxy: X402PoolProxy): string[] {
  const lines = [
    `HTTP: ${proxy.http || `http://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.httpPort}`}`,
    `Host: ${proxy.host}`,
    `Port: ${proxy.httpPort}`,
    `Username: ${proxy.username}`,
    `Password: ${proxy.password}`,
  ];
  if (proxy.usernameTemplate) lines.push(`Username template: ${proxy.usernameTemplate}`);
  return lines;
}

function poolCreditLines(credit: X402PoolCredit): string[] {
  const lines = [
    `Allocated: ${credit.allocatedGB} GB`,
    `Used: ${credit.usedGB} GB`,
    `Remaining: ${credit.remainingGB} GB`,
  ];
  if (credit.tier) lines.unshift(`Tier: ${credit.tier}`);
  if (credit.expiresAt) lines.push(`Expires: ${new Date(credit.expiresAt).toISOString()}`);
  return lines;
}

/**
 * Create x402 tool handlers
 */
export function createX402ToolHandlers(
  client: X402Client,
  wallet: AgentWallet,
  cache: X402SessionCache
) {
  /** The cached session a tool refers to, or a thrown explanation. */
  function requireSession(sessionId?: string): CachedSession {
    const session = sessionId ? cache.getSession(sessionId) : cache.getFirstActiveSession();
    if (session) return session;
    throw new Error(
      sessionId
        ? `Session not found: ${sessionId}. Use x402_list_sessions to see the sessions this wallet has.`
        : 'No active x402 session. Buy a proxy first with x402_get_proxy.',
    );
  }

  function requirePoolToken(sessionToken?: string): string {
    const token = sessionToken || cache.getPoolToken();
    if (!token) throw new Error(NO_POOL_TOKEN);
    return token;
  }

  return {
    /**
     * Purchase proxy via x402 payment
     */
    async x402_get_proxy(args: {
      country: string;
      duration_hours?: number;
      traffic_gb?: number;
      city?: string;
      carrier?: string;
    }): Promise<string> {
      // The client checks the wallet balance against the amount the API asks for.
      const result = await client.purchaseProxy({
        country: args.country,
        durationHours: args.duration_hours,
        trafficGB: args.traffic_gb,
        city: args.city,
        carrier: args.carrier,
      });

      // Cache the session with its manage token so x402_extend_session works later
      const manageToken =
        (result as unknown as { management?: { sessionToken?: string } }).management?.sessionToken ||
        (result.session as unknown as { sessionToken?: string })?.sessionToken;
      cache.addSessionFromResponse({
        session: result.session,
        rotationUrl: result.session.rotationUrl,
        rotationToken: result.session.rotationToken,
        sessionToken: manageToken,
      });

      const urls = proxyUrls(result.session.proxy);

      return [
        `Proxy purchased successfully!`,
        ``,
        `--- Connection Details ---`,
        `HTTP:   ${urls.http}`,
        `SOCKS5: ${urls.socks5}`,
        ``,
        `--- Session Info ---`,
        `Session ID: ${result.session.id}`,
        `Location: ${result.session.location.country || result.session.location.countryCode}`,
        `Expires: ${new Date(result.session.expiresAt).toISOString()}`,
        `Traffic: ${result.session.traffic.allowedGB} GB`,
        ``,
        `--- Payment ---`,
        `Amount: $${result.payment.amountPaid} USDC`,
        `Network: ${result.payment.network}`,
        `TX Hash: ${result.payment.transactionHash}`,
        ``,
        `Rotation URL: ${result.session.rotationUrl}`,
      ].join('\n');
    },

    /**
     * Get pricing information
     */
    async x402_get_pricing(args: { traffic_gb?: number }): Promise<string> {
      const pricing = await client.getProxyPricing();
      const perGB = pricing.shared.trafficPricePerGB;
      const trafficGB = args.traffic_gb ?? 1;
      const total = trafficGB * perGB;
      const balance = await wallet.getBalance();
      const balanceUsd = Number(balance.usdc) / 1e6;

      return [
        `x402 Proxy Pricing`,
        ``,
        `Traffic: ${trafficGB} GB x $${perGB.toFixed(2)}/GB = $${total.toFixed(2)} USDC`,
        `Duration: free, ${pricing.minDurationSeconds / 3600} hour(s) to ${pricing.maxDurationSeconds / 86400} days`,
        `Smallest purchase: ${pricing.minTrafficGB} GB`,
        `Networks: ${pricing.networks.filter((n) => n.enabled).map((n) => n.network).join(', ')}`,
        ``,
        `Your wallet: ${balance.formatted} (${balanceUsd >= total ? 'enough' : `$${(total - balanceUsd).toFixed(2)} short`})`,
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
        lines.push(`Session: ${session.id}`);
        lines.push(`  Location: ${session.location.country || session.location.countryCode}`);
        lines.push(`  Expires in: ${cache.getTimeRemaining(session.id)?.display || 'Unknown'}`);
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
      const session = requireSession(args.session_id);

      // Fresh status from the API; the cached session still answers if it is unreachable
      const freshStatus = await client.getSessionStatus(session.id).catch(() => undefined);
      const timeRemaining = cache.getTimeRemaining(session.id);
      const cachedStatus = timeRemaining && timeRemaining.seconds > 0 ? 'active' : 'expired';
      const urls = proxyUrls(session.proxy);

      const lines = [
        `Session Status`,
        ``,
        `ID: ${session.id}`,
        `Status: ${freshStatus?.status || cachedStatus}`,
        `Location: ${session.location.country || session.location.countryCode}`,
        ``,
        `--- Time ---`,
        `Expires: ${new Date(session.expiresAt).toISOString()}`,
        `Remaining: ${timeRemaining?.display || 'Unknown'}`,
      ];

      if (freshStatus?.traffic) {
        lines.push(``);
        lines.push(`--- Traffic ---`);
        lines.push(`Allowed: ${freshStatus.traffic.allowedGB} GB`);
        lines.push(`Used: ${freshStatus.traffic.usedGB?.toFixed(2) || '0.00'} GB`);
        lines.push(`Remaining: ${freshStatus.traffic.remainingGB?.toFixed(2) || freshStatus.traffic.allowedGB} GB`);
      }

      lines.push(``);
      lines.push(`--- Connection ---`);
      lines.push(`HTTP: ${urls.http}`);
      lines.push(`SOCKS5: ${urls.socks5}`);

      if (session.rotationUrl) {
        lines.push(``);
        lines.push(`Rotation URL: ${session.rotationUrl}`);
      }

      return lines.join('\n');
    },

    /**
     * Check wallet balance
     */
    async x402_wallet_balance(): Promise<string> {
      const info = await wallet.getInfo();

      return [
        `x402 Wallet Balance`,
        ``,
        `Address: ${info.address}`,
        `Network: Base`,
        ``,
        `USDC Balance: ${info.usdcBalance.formatted}`,
        `ETH Balance: ${info.ethBalance} (for gas)`,
        ``,
        `To top up, send USDC on the Base network to the address above.`,
      ].join('\n');
    },

    /**
     * Move the proxy to another device
     */
    async x402_rotate_ip(args: { session_id?: string }): Promise<string> {
      const session = requireSession(args.session_id);
      if (!session.rotationUrl) {
        throw new Error(`Session ${session.id} has no rotation URL.`);
      }

      const response = await fetch(session.rotationUrl);
      const result = await response.json().catch(() => ({})) as { success?: boolean; message?: string };

      if (!response.ok || result.success === false) {
        throw new Error(`Rotation refused: ${result.message || `HTTP ${response.status}`}. Rotations are limited to one per 5 minutes; wait and retry.`);
      }

      return [
        `Proxy rotated: session ${session.id} is on another device now.`,
        result.message || '',
        `The connection details stay the same. Send a request through the proxy to see the new exit IP.`,
      ].filter(Boolean).join('\n');
    },

    /**
     * List countries where an x402 proxy can be bought now
     */
    async x402_list_countries(): Promise<string> {
      const countries = await client.getCountries();

      if (countries.length === 0) {
        return 'No country has a free device for an x402 proxy right now. Pool access may still have stock: see pool_get_stock.';
      }

      return [
        `Countries with a free device for x402_get_proxy:`,
        ``,
        ...countries.map((c) => `${c.code} - ${c.name} - ${c.availableDevices} free device(s)`),
        ``,
        `These are carrier modems. For other countries buy pool access (x402_get_pool_access) and check pool_get_stock.`,
      ].join('\n');
    },

    /**
     * Extend an active session's duration (free: duration-only top-up)
     */
    async x402_extend_session(args: { session_id?: string; additional_hours?: number }): Promise<string> {
      const additionalHours = args.additional_hours || 1;

      // session_id may be the x402s_ token itself, or the id of a cached session that stored one
      const cached = args.session_id?.startsWith('x402s_') ? undefined : requireSession(args.session_id);
      const sessionToken = cached ? cached.sessionToken : args.session_id;
      if (!sessionToken) {
        throw new Error(
          `No session token is stored for session ${cached?.id}. Call this tool again with the x402s_ token from the purchase response as session_id.`,
        );
      }

      const extended = await client.extendSession(sessionToken, additionalHours);
      cache.updateSessionExpiry(cached?.id || extended.sessionId, extended.expiresAt);

      return [
        `Session extended (time is free, no payment was sent).`,
        ``,
        `Session: ${extended.sessionId}`,
        `Added: ${additionalHours} hour(s)`,
        `New expiry: ${new Date(extended.expiresAt).toISOString()}`,
        extended.ports?.length ? `Ports extended: ${extended.ports.length}` : '',
      ].filter(Boolean).join('\n');
    },

    /**
     * Buy Pool Gateway access with USDC (one credential for every country of the tier)
     */
    async x402_get_pool_access(args: {
      country?: string;
      traffic_gb?: number;
      tier?: string;
      sid?: string;
      rot?: string;
    }): Promise<string> {
      // The client checks the wallet balance against the amount the API asks for.
      const result = await client.purchasePoolAccess({
        country: args.country,
        trafficGB: args.traffic_gb,
        tier: args.tier,
        sid: args.sid,
        rot: args.rot,
      });

      // Cache the session token for the follow-up pool tools
      if (result.sessionToken) {
        cache.setPoolToken(result.sessionToken);
      }

      const lines = [
        `Pool Gateway access purchased.`,
        ``,
        `One credential reaches every country of the tier: put pool and country in the username`,
        `(for example ${result.proxy.username}-peer-de). pool_build_proxy_url builds it for you.`,
        ``,
        `--- Connection ---`,
        ...poolConnectionLines(result.proxy),
        ``,
        `--- Credit ---`,
        ...poolCreditLines(result.credit),
        ``,
        `Session token (cached for the other x402_pool_* tools): ${result.sessionToken}`,
      ];
      if (result.payment) {
        lines.push(``, `--- Payment ---`);
        if (result.payment.amountUSDC !== undefined) lines.push(`Amount: $${result.payment.amountUSDC} USDC`);
        if (result.payment.network) lines.push(`Network: ${result.payment.network}`);
        if (result.payment.txHash) lines.push(`TX: ${result.payment.txHash}`);
      }
      lines.push(``, `Sticky holds the device, not the IP: a mobile carrier can still change the exit IP.`);
      if (result.caveats?.length) {
        lines.push(``, ...result.caveats.map((c) => `- ${c}`));
      }

      return lines.join('\n');
    },

    /**
     * Check remaining pool credit
     */
    async x402_pool_credit(args: { session_token?: string }): Promise<string> {
      const credit = await client.getPoolCredit(requirePoolToken(args.session_token));
      return [
        `Pool Gateway Credit`,
        ``,
        ...poolCreditLines(credit),
        `Status: ${credit.enabled ? 'enabled' : 'suspended (cap reached or disabled)'}`,
      ].join('\n');
    },

    /**
     * Top up a pool session with more GB and/or duration
     */
    async x402_pool_topup(args: {
      session_token?: string;
      add_traffic_gb?: number;
      add_duration_seconds?: number;
    }): Promise<string> {
      const token = requirePoolToken(args.session_token);
      if (!args.add_traffic_gb && !args.add_duration_seconds) {
        throw new Error('Give add_traffic_gb (paid) and/or add_duration_seconds (free).');
      }

      const credit = await client.topUpPool(token, {
        addTrafficGB: args.add_traffic_gb,
        addDurationSeconds: args.add_duration_seconds,
      });

      const lines = [`Pool session topped up.`];
      if (args.add_traffic_gb) lines.push(`Added traffic: ${args.add_traffic_gb} GB (paid in USDC).`);
      if (args.add_duration_seconds) lines.push(`Added time: ${args.add_duration_seconds} seconds (free).`);
      lines.push(``, `--- Updated Credit ---`, ...poolCreditLines(credit));

      return lines.join('\n');
    },

    /**
     * Rotate the pool credential secret (same username, new password)
     */
    async x402_pool_regenerate(args: { session_token?: string }): Promise<string> {
      const result = await client.regeneratePool(requirePoolToken(args.session_token));
      return [
        `Pool password replaced. The username is the same; the old password no longer works.`,
        ``,
        ...poolConnectionLines(result.proxy),
      ].join('\n');
    },

    /**
     * Re-emit pool credentials (recovery)
     */
    async x402_pool_connection(args: { session_token?: string }): Promise<string> {
      const result = await client.getPoolConnection(requirePoolToken(args.session_token));
      return [`Pool Gateway Connection`, ``, ...poolConnectionLines(result.proxy)].join('\n');
    },

    /**
     * Get per-day bandwidth usage (MB) for a pool session
     */
    async x402_pool_usage(args: { session_token?: string; days?: number }): Promise<string> {
      const result = await client.getPoolUsage(requirePoolToken(args.session_token), args.days);
      const lines = [`Pool Gateway Usage, last ${result.days ?? args.days ?? 30} days (MB per day)`, ``];

      if (!result.usage || result.usage.length === 0) {
        lines.push(`No usage recorded yet.`);
      }
      for (const day of result.usage ?? []) {
        lines.push(`  ${day.date}: ${day.mb} MB`);
      }

      return lines.join('\n');
    },

    /**
     * Get the Pool Gateway tier catalog (no auth)
     */
    async x402_pool_pricing(): Promise<string> {
      const pricing = await client.getPoolPricing();
      const lines = [`Pool Gateway tiers for x402 (duration is free):`, ``];

      for (const t of pricing.tiers || []) {
        const parts = [`${t.tier}: $${t.pricePerGB}/GB`];
        if (t.minPurchaseGB) parts.push(`smallest purchase ${t.minPurchaseGB} GB`);
        lines.push(`  ${parts.join(' - ')}`);
      }
      if (pricing.defaultTier) lines.push(``, `Tier used when none is named: ${pricing.defaultTier}`);
      lines.push(``, `Live stock per country: pool_get_stock.`);

      return lines.join('\n');
    },

    /**
     * Check x402 service status
     */
    async x402_service_status(): Promise<string> {
      const [health, balance] = await Promise.all([
        client.getHealth(),
        wallet.getBalance().then((b) => b.formatted, () => 'could not be read'),
      ]);
      const expiringSoon = cache.getExpiringSoon(30);

      return [
        `x402 Service Status`,
        ``,
        `API: ${health.status}`,
        `x402 payments: ${health.enabled ? 'enabled' : 'disabled'}`,
        `Wallet: ${wallet.address}`,
        `Wallet balance: ${balance}`,
        `Active sessions: ${cache.getActiveSessions().length}`,
        expiringSoon.length > 0 ? `Sessions expiring within 30 minutes: ${expiringSoon.length}` : '',
      ].filter(Boolean).join('\n');
    },
  };
}

/**
 * Tool handler type
 */
export type X402ToolHandlers = ReturnType<typeof createX402ToolHandlers>;
