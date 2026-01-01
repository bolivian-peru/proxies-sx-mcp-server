/**
 * Proxies.sx API Client
 * HTTP client with API key or JWT authentication
 */

import type { ApiError } from './types.js';

export type AuthType = 'apiKey' | 'jwt';

export interface ApiClientConfig {
  baseUrl: string;
  token: string;
  authType: AuthType;
  timeout?: number;
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

  static fromApiError(error: ApiError): ApiClientError {
    return new ApiClientError(
      error.message || 'Unknown API error',
      error.statusCode,
      error
    );
  }
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly authType: AuthType;
  private readonly timeout: number;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.token = config.token;
    this.authType = config.authType;
    this.timeout = config.timeout ?? 30000; // 30 seconds default
  }

  /**
   * Build full URL for endpoint
   */
  private buildUrl(endpoint: string, queryParams?: Record<string, string | number | boolean | undefined>): string {
    const url = new URL(`${this.baseUrl}${endpoint}`);

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
   * Build request headers with authentication
   */
  private buildHeaders(additionalHeaders?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...additionalHeaders,
    };

    // Add auth header based on type
    if (this.authType === 'apiKey') {
      headers['X-API-Key'] = this.token;
    } else {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    return headers;
  }

  /**
   * Make HTTP request with timeout
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
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

      const apiError = errorBody as ApiError;
      throw new ApiClientError(
        apiError?.message || `HTTP ${response.status}: ${response.statusText}`,
        response.status,
        errorBody
      );
    }

    if (!isJson) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  /**
   * GET request
   * @param queryParams - Query parameters (direct object for backwards compatibility)
   * @param headers - Optional custom headers
   */
  async get<T>(
    endpoint: string,
    queryParams?: Record<string, string | number | boolean | undefined>,
    headers?: Record<string, string>
  ): Promise<T> {
    const url = this.buildUrl(endpoint, queryParams);
    const response = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers: this.buildHeaders(headers),
    });
    return this.handleResponse<T>(response);
  }

  /**
   * POST request
   */
  async post<T>(
    endpoint: string,
    body?: unknown,
    queryParams?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    const url = this.buildUrl(endpoint, queryParams);
    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    return this.handleResponse<T>(response);
  }

  /**
   * PUT request
   */
  async put<T>(
    endpoint: string,
    body?: unknown,
    queryParams?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    const url = this.buildUrl(endpoint, queryParams);
    const response = await this.fetchWithTimeout(url, {
      method: 'PUT',
      headers: this.buildHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    return this.handleResponse<T>(response);
  }

  /**
   * PATCH request
   */
  async patch<T>(
    endpoint: string,
    body?: unknown,
    queryParams?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    const url = this.buildUrl(endpoint, queryParams);
    const response = await this.fetchWithTimeout(url, {
      method: 'PATCH',
      headers: this.buildHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    return this.handleResponse<T>(response);
  }

  /**
   * DELETE request
   */
  async delete<T>(
    endpoint: string,
    queryParams?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    const url = this.buildUrl(endpoint, queryParams);
    const response = await this.fetchWithTimeout(url, {
      method: 'DELETE',
      headers: this.buildHeaders(),
    });
    return this.handleResponse<T>(response);
  }
}

/**
 * Create API client instance
 */
export function createApiClient(config: ApiClientConfig): ApiClient {
  if (!config.token) {
    throw new Error('Authentication token is required');
  }
  if (!config.baseUrl) {
    throw new Error('Base URL is required');
  }
  return new ApiClient(config);
}
