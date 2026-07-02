/**
 * x402 Session Cache
 * Local persistence for active x402 proxy sessions
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import type { CachedSession, SessionCacheData, ProxyCredentials, LocationInfo } from './types.js';

/**
 * Default cache directory
 */
const DEFAULT_CACHE_DIR = join(homedir(), '.proxies-sx');
const DEFAULT_CACHE_FILE = 'x402-sessions.json';

/**
 * x402 Session Cache
 * Manages local storage of active x402 sessions
 */
export class X402SessionCache {
  private cachePath: string;
  private walletAddress: string;
  private cache: SessionCacheData;

  constructor(walletAddress: string, cachePath?: string) {
    this.walletAddress = walletAddress.toLowerCase();
    this.cachePath = cachePath || join(DEFAULT_CACHE_DIR, DEFAULT_CACHE_FILE);
    this.cache = this.load();
  }

  /**
   * Load cache from disk
   */
  private load(): SessionCacheData {
    try {
      if (existsSync(this.cachePath)) {
        const data = JSON.parse(readFileSync(this.cachePath, 'utf-8'));

        // Check if cache belongs to this wallet
        if (data.walletAddress?.toLowerCase() === this.walletAddress) {
          // Filter out expired sessions
          const now = new Date();
          data.sessions = (data.sessions || []).filter(
            (s: CachedSession) => new Date(s.expiresAt) > now
          );
          return data;
        }
      }
    } catch (error) {
      // Ignore parse errors, start fresh
      console.error('Failed to load session cache:', error);
    }

    // Return fresh cache
    return {
      walletAddress: this.walletAddress,
      sessions: [],
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Save cache to disk
   */
  private save(): void {
    try {
      const dir = dirname(this.cachePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      this.cache.lastUpdated = new Date().toISOString();
      writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2));
    } catch (error) {
      console.error('Failed to save session cache:', error);
    }
  }

  /**
   * Add or update a session
   */
  addSession(session: CachedSession): void {
    // Remove existing session with same ID
    this.cache.sessions = this.cache.sessions.filter(
      (s) => s.id !== session.id
    );

    // Add new session
    this.cache.sessions.push(session);

    this.save();
  }

  /**
   * Add session from API response
   */
  addSessionFromResponse(response: {
    session: {
      id: string;
      proxy: ProxyCredentials;
      expiresAt: string;
      location: LocationInfo;
    };
    rotationUrl?: string;
    rotationToken?: string;
  }): void {
    const session: CachedSession = {
      id: response.session.id,
      proxy: response.session.proxy,
      expiresAt: response.session.expiresAt,
      location: response.session.location,
      rotationUrl: response.rotationUrl || '',
      rotationToken: response.rotationToken || '',
    };

    this.addSession(session);
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): CachedSession | undefined {
    this.cleanExpired();
    return this.cache.sessions.find((s) => s.id === sessionId);
  }

  /**
   * Get all active (non-expired) sessions
   */
  getActiveSessions(): CachedSession[] {
    this.cleanExpired();
    return [...this.cache.sessions];
  }

  /**
   * Get the first active session (most recently added)
   */
  getFirstActiveSession(): CachedSession | undefined {
    const sessions = this.getActiveSessions();
    return sessions.length > 0 ? sessions[sessions.length - 1] : undefined;
  }

  /**
   * Get session by country code
   */
  getSessionByCountry(countryCode: string): CachedSession | undefined {
    this.cleanExpired();
    return this.cache.sessions.find(
      (s) => s.location.countryCode?.toUpperCase() === countryCode.toUpperCase()
    );
  }

  /**
   * Check if there are any active sessions
   */
  hasActiveSessions(): boolean {
    return this.getActiveSessions().length > 0;
  }

  /**
   * Get count of active sessions
   */
  getActiveCount(): number {
    return this.getActiveSessions().length;
  }

  /**
   * Remove a session by ID
   */
  removeSession(sessionId: string): boolean {
    const initialLength = this.cache.sessions.length;
    this.cache.sessions = this.cache.sessions.filter((s) => s.id !== sessionId);

    if (this.cache.sessions.length !== initialLength) {
      this.save();
      return true;
    }
    return false;
  }

  /**
   * Remove expired sessions
   */
  private cleanExpired(): void {
    const now = new Date();
    const initialLength = this.cache.sessions.length;

    this.cache.sessions = this.cache.sessions.filter(
      (s) => new Date(s.expiresAt) > now
    );

    if (this.cache.sessions.length !== initialLength) {
      this.save();
    }
  }

  /**
   * Clear all sessions
   */
  clear(): void {
    this.cache.sessions = [];
    this.save();
  }

  /**
   * Update session expiration time
   */
  updateSessionExpiry(sessionId: string, newExpiresAt: string): boolean {
    const session = this.cache.sessions.find((s) => s.id === sessionId);
    if (session) {
      session.expiresAt = newExpiresAt;
      this.save();
      return true;
    }
    return false;
  }

  /**
   * Get time remaining for a session
   */
  getTimeRemaining(sessionId: string): { seconds: number; display: string } | null {
    const session = this.getSession(sessionId);
    if (!session) return null;

    const now = Date.now();
    const expires = new Date(session.expiresAt).getTime();
    const remainingMs = expires - now;

    if (remainingMs <= 0) {
      return { seconds: 0, display: 'Expired' };
    }

    const seconds = Math.floor(remainingMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    let display: string;
    if (days > 0) {
      display = `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      display = `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      display = `${minutes}m ${seconds % 60}s`;
    } else {
      display = `${seconds}s`;
    }

    return { seconds, display };
  }

  /**
   * Get sessions expiring soon (within specified minutes)
   */
  getExpiringSoon(withinMinutes: number = 30): CachedSession[] {
    const now = Date.now();
    const threshold = now + withinMinutes * 60 * 1000;

    return this.getActiveSessions().filter((s) => {
      const expires = new Date(s.expiresAt).getTime();
      return expires <= threshold && expires > now;
    });
  }

  /**
   * Get cache info
   */
  getInfo(): {
    walletAddress: string;
    sessionCount: number;
    lastUpdated: string;
    cachePath: string;
  } {
    return {
      walletAddress: this.walletAddress,
      sessionCount: this.getActiveCount(),
      lastUpdated: this.cache.lastUpdated,
      cachePath: this.cachePath,
    };
  }
}

/**
 * Create session cache instance
 */
export function createSessionCache(
  walletAddress: string,
  cachePath?: string
): X402SessionCache {
  return new X402SessionCache(walletAddress, cachePath);
}
