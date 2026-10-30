/**
 * Error explanations
 * One place that turns a Proxies.sx API status or a Pool Gateway error code
 * into text an agent can act on. Used by the API client (HTTP status) and by
 * the server's single tool-error path (gateway codes, secret redaction).
 */

interface GatewayError {
  status: number;
  meaning: string;
  action: string;
}

/**
 * Pool Gateway error codes (gw.proxies.sx). The gateway returns them as
 * `CODE: message (req: uuid)` and in the X-Proxies-Error-Code header.
 */
export const GATEWAY_ERRORS: Record<string, GatewayError> = {
  E_AUTH_REQUIRED: {
    status: 407,
    meaning: 'No Proxy-Authorization header was sent.',
    action: 'Send the proxy username and password. Get them with pool_get_my_credentials and build the URL with pool_build_proxy_url.',
  },
  E_AUTH_INVALID: {
    status: 407,
    meaning: 'The proxy username or password was rejected.',
    action: 'Use the proxy password from pool_get_my_credentials (it is not the account login password) or a pak_ key. Set a new one with pool_set_proxy_password if needed.',
  },
  E_BALANCE_EXHAUSTED: {
    status: 407,
    meaning: 'The credentials are valid but the account has no traffic left.',
    action: 'Check the balance with get_account_usage, then add GB at https://client.proxies.sx/purchase. Do not change the password: it is correct.',
  },
  E_CAP_EXCEEDED: {
    status: 407,
    meaning: 'The pak_ key reached its traffic cap.',
    action: 'Raise the cap with pool_topup_key (reseller key) or ask whoever issued the key.',
  },
  E_ACCOUNT_DISABLED: {
    status: 407,
    meaning: 'The account is suspended or deleted.',
    action: 'Open a ticket with create_support_ticket.',
  },
  E_USERNAME_PARSE: {
    status: 400,
    meaning: 'The proxy username is missing or longer than 256 characters.',
    action: 'Rebuild the username with pool_build_proxy_url.',
  },
  E_RATE_LIMITED_AUTH: {
    status: 429,
    meaning: 'Too many failed authentication attempts.',
    action: 'Stop retrying with the same credentials, wait a few minutes, then fix the password (pool_get_my_credentials).',
  },
  E_RATE_LIMITED_CONN: {
    status: 429,
    meaning: 'The account is over its limit of 500 concurrent connections.',
    action: 'Lower concurrency or close idle connections, then retry.',
  },
  E_SESSION_LIMIT: {
    status: 429,
    meaning: 'The account is over its limit of 250 concurrent sessions.',
    action: 'Reuse session ids, or free sessions with pool_close_session or pool_close_all_sessions.',
  },
  E_NO_STOCK_COUNTRY: {
    status: 502,
    meaning: 'No endpoint is online for that pool, country and filter.',
    action: 'Check pool_get_stock for the country. The mbl pool exists only in US, GB, FR, NL, PL and GE (Georgia), so use peer elsewhere (for example peer-de). Loosen carrier, city, asn or iptype filters.',
  },
  E_STOCK_DEGRADED: {
    status: 502,
    meaning: 'The selected endpoint went away during the request.',
    action: 'Retry the request. With a sticky session, use a new sid if it keeps failing.',
  },
  E_UPSTREAM_REFUSED: {
    status: 502,
    meaning: 'The exit device refused or dropped the connection.',
    action: 'Retry. If one target keeps failing, try another session id or country.',
  },
  E_SSRF_BLOCKED: {
    status: 403,
    meaning: 'The target is a private, localhost or cloud-metadata address.',
    action: 'Request a public internet host.',
  },
  E_WRONG_PORT: {
    status: 400,
    meaning: 'The scheme does not match the gateway port.',
    action: 'Use http:// on port 7000 or socks5h:// on port 7001.',
  },
  E_INTERNAL: {
    status: 503,
    meaning: 'Unexpected gateway error.',
    action: 'Retry after a short wait. If it continues, check get_service_status.',
  },
};

const HINT_MARKER = 'What to do:';

/**
 * Mask credentials that must never reach a tool result or a log line. A wallet
 * key has the shape of a transaction hash, which an error must be able to
 * name, so the server masks the exact key it was started with (server.ts).
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/\b(psx|pak|x402s)_[A-Za-z0-9]{12,}/g, '$1_[redacted]')
    .replace(/(:\/\/[^:@/\s]+):[^@/\s]+@/g, '$1:[redacted]@');
}

function statusHint(statusCode: number, message: string): string | null {
  if (statusCode === 401) {
    return 'The API key is missing, invalid, expired or revoked. Create a key at https://client.proxies.sx/account and set it as PROXIES_API_KEY (local) or send it as "Authorization: Bearer <key>" (hosted, https://api.proxies.sx/mcp).';
  }
  if (statusCode === 403) {
    const scope = message.match(/scope:?\s*([a-z]+:[a-z]+)/i)?.[1];
    if (!scope) return 'This key is not allowed to do that. Check its scopes and the account role at https://client.proxies.sx/account.';
    if (scope === 'billing:write') {
      return 'This needs the billing:write scope, which only reseller or admin keys can hold. A customer buys traffic in the dashboard at https://client.proxies.sx/purchase.';
    }
    if (scope.startsWith('customers:')) {
      return `This needs the ${scope} scope, which only a reseller account's key can hold: the pak_ key tools are for resellers. For your own traffic use pool_get_my_credentials.`;
    }
    return `Create a key that includes the ${scope} scope at https://client.proxies.sx/account.`;
  }
  if (statusCode === 404 && /^Cannot (GET|POST|PUT|PATCH|DELETE) /.test(message)) {
    return 'This route does not exist on the API. Update @proxies-sx/mcp-server to the latest version, and leave PROXIES_API_URL unset unless you run a private API.';
  }
  if (statusCode === 429) {
    return 'Rate limited. Wait a minute before retrying and do not loop on this call.';
  }
  if (statusCode >= 500) {
    return 'The API failed on its side. Retry once after a short wait, then check get_service_status.';
  }
  return null;
}

/**
 * Append an actionable hint to an error message and mask secrets.
 * Idempotent: a message that already carries a hint is only redacted.
 */
export function explainError(message: string, statusCode?: number): string {
  const safe = redactSecrets(message);
  if (safe.includes(HINT_MARKER)) return safe;

  const code = safe.match(/\bE_[A-Z_]+\b/)?.[0];
  const gateway = code ? GATEWAY_ERRORS[code] : undefined;
  if (gateway) return `${safe}\n${HINT_MARKER} ${gateway.meaning} ${gateway.action}`;

  const hint = statusCode ? statusHint(statusCode, safe) : null;
  return hint ? `${safe}\n${HINT_MARKER} ${hint}` : safe;
}

/**
 * Error body of the Proxies.sx API. The purchase routes (private modems,
 * balance top-up) add a stable `code` and a one-sentence `fix`; class-validator
 * answers with an array of messages.
 */
export interface ApiErrorBody {
  message?: string | string[];
  code?: string;
  fix?: string;
}

/**
 * Explain an API error body. The API's own `fix` wins over the generic status
 * hint, and the `code` is kept in the text so an agent can branch on it.
 */
export function explainApiError(body: ApiErrorBody, statusCode: number, statusText = ''): string {
  const raw = body.message;
  const message = (Array.isArray(raw) ? raw.join('; ') : raw) || `HTTP ${statusCode}: ${statusText}`;
  const withCode = body.code ? `${message} [${body.code}]` : message;
  if (body.fix) return `${redactSecrets(withCode)}\n${HINT_MARKER} ${body.fix}`;
  return explainError(withCode, statusCode);
}
