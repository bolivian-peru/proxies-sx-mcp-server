/**
 * Proxies.sx API Client
 * HTTP client with API key or JWT authentication
 */

import { explainApiError, type ApiErrorBody } from '../utils/errors.js';

export type AuthType = 'apiKey' | 'jwt';

export interface ApiClientConfig {
  baseUrl: string;
  /** API key or JWT. Omit for a client that only calls public routes. */
  token?: string;
  authType?: AuthType;
  timeout?: number;
  /** The caller's IP, sent as X-Forwarded-For so the API rate-limits each hosted caller separately */
  forwardedFor?: string;
}

type QueryParams = Record<string, string | number | boolean | undefined>;

interface RequestOptions {
  body?: unknown;
  queryParams?: QueryParams;
  headers?: Record<string, string>;
}

export class ApiClientError extends Error {
  public readonly statusCode: number;
  public readonly responseBody: unknown;

  constructor(message: string, statusCode: number, responseBody?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly authType: AuthType;
  private readonly timeout: number;
  private readonly forwardedFor?: string;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.token = config.token;
    this.authType = config.authType ?? 'apiKey';
    this.timeout = config.timeout ?? 30000; // 30 seconds default
    this.forwardedFor = config.forwardedFor;
  }

  /**
   * Build full URL for endpoint
   */
  private buildUrl(endpoint: string, queryParams?: QueryParams): string {
    // Ids from tool arguments are put into the path. If URL parsing changes the
    // path at all (?, #, a backslash, a dot segment, or tabs and newlines it
    // silently drops), an id could steer the request to another route.
    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (url.pathname !== new URL(this.baseUrl).pathname.replace(/\/$/, '') + endpoint) {
      throw new ApiClientError('An id in this request contains characters that are not allowed (?, #, \\, spaces or control characters, or a "." or ".." path segment).', 0);
    }

    if (queryParams) {
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    return url.toString();
  }

  /**
   * Build request headers. The account credential is added only when the
   * client has one: public routes work without it.
   */
  private buildHeaders(additionalHeaders?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...additionalHeaders,
    };
    if (this.forwardedFor) headers['X-Forwarded-For'] = this.forwardedFor;

    if (!this.token) return headers;

    if (this.authType === 'apiKey') {
      headers['X-API-Key'] = this.token;
    } else {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    return headers;
  }

  /**
   * Handle API response
   */
  private async handleResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('content-type');
    const isJson = contentType?.includes('application/json');

    if (!response.ok) {
      let errorBody: unknown;

      if (isJson) {
        try {
          errorBody = await response.json();
        } catch {
          errorBody = { message: 'Failed to parse error response' };
        }
      } else {
        errorBody = { message: await response.text() };
      }

      throw new ApiClientError(explainApiError((errorBody ?? {}) as ApiErrorBody, response.status, response.statusText), response.status, errorBody);
    }

    if (!isJson) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  /**
   * Make one HTTP request with a timeout
   */
  private async request<T>(method: string, endpoint: string, options: RequestOptions = {}): Promise<T> {
    const url = this.buildUrl(endpoint, options.queryParams);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: this.buildHeaders(options.headers),
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      let reason = error instanceof Error ? error.message : 'network error';
      if (controller.signal.aborted) reason = `no answer within ${this.timeout / 1000} seconds`;
      throw new ApiClientError(`Could not reach the Proxies.sx API (${reason}). Check the network and retry.`, 0);
    } finally {
      clearTimeout(timeoutId);
    }

    return this.handleResponse<T>(response);
  }

  /**
   * GET request
   * @param queryParams - Query parameters
   * @param headers - Optional custom headers (for example X-Session-Token)
   */
  async get<T>(endpoint: string, queryParams?: QueryParams, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('GET', endpoint, { queryParams, headers });
  }

  /**
   * POST request
   */
  async post<T>(endpoint: string, body?: unknown, queryParams?: QueryParams, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('POST', endpoint, { body, queryParams, headers });
  }

  /**
   * PUT request
   */
  async put<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', endpoint, { body });
  }

  /**
   * PATCH request
   */
  async patch<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', endpoint, { body });
  }

  /**
   * DELETE request
   */
  async delete<T>(endpoint: string, queryParams?: QueryParams): Promise<T> {
    return this.request<T>('DELETE', endpoint, { queryParams });
  }
}

/**
 * Create API client instance
 */
export function createApiClient(config: ApiClientConfig): ApiClient {
  if (!config.baseUrl) {
    throw new Error('Base URL is required');
  }
  return new ApiClient(config);
}
