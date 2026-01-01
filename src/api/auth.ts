/**
 * Authentication API Module
 * Handles login with email/password to get JWT token
 */

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  user: {
    _id: string;
    email: string;
    role: string;
  };
}

export interface AuthConfig {
  baseUrl: string;
  email?: string;
  password?: string;
  apiKey?: string;
}

/**
 * Login with email and password to get JWT token
 */
export async function login(baseUrl: string, email: string, password: string): Promise<LoginResponse> {
  const url = `${baseUrl.replace(/\/$/, '')}/v1/login/signin`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Login failed' })) as { message?: string };
    throw new Error(error.message || `Login failed with status ${response.status}`);
  }

  return response.json() as Promise<LoginResponse>;
}

/**
 * Get authentication token from config
 * Supports both API key and email/password login
 */
export async function getAuthToken(config: AuthConfig): Promise<{ token: string; type: 'apiKey' | 'jwt' }> {
  // If API key is provided, use it directly
  if (config.apiKey) {
    return { token: config.apiKey, type: 'apiKey' };
  }

  // If email/password provided, login to get JWT
  if (config.email && config.password) {
    const result = await login(config.baseUrl, config.email, config.password);
    return { token: result.access_token, type: 'jwt' };
  }

  throw new Error(
    'Authentication required. Provide either:\n' +
    '  - PROXIES_API_KEY: Your API key from https://client.proxies.sx/account\n' +
    '  - PROXIES_EMAIL and PROXIES_PASSWORD: Your login credentials'
  );
}
