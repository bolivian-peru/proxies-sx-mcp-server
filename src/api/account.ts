/**
 * Account API Module
 * Endpoints for account information and usage
 */

import type { ApiClient } from './client.js';
import type { AccountSummary, TrafficBalanceBreakdown, Notification, PaginatedResponse } from './types.js';

export class AccountApi {
  constructor(private readonly client: ApiClient) {}

  /**
   * Get account summary with balance and resources
   * Required scope: account:read
   */
  async getSummary(): Promise<AccountSummary> {
    return this.client.get<AccountSummary>('/v1/account/summary');
  }

  /**
   * Get traffic balance breakdown
   * Required scope: traffic:read
   */
  async getTrafficBreakdown(): Promise<TrafficBalanceBreakdown> {
    return this.client.get<TrafficBalanceBreakdown>('/v1/traffic/balance-breakdown');
  }

  /**
   * Get account notifications
   * Required scope: account:read
   */
  async getNotifications(params?: {
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
  }): Promise<PaginatedResponse<Notification>> {
    return this.client.get<PaginatedResponse<Notification>>('/v1/account/notifications', {
      limit: params?.limit ?? 20,
      offset: params?.offset ?? 0,
      unreadOnly: params?.unreadOnly,
    });
  }

  /**
   * Mark notification as read
   * Required scope: account:write
   */
  async markNotificationRead(notificationId: string): Promise<Notification> {
    return this.client.put<Notification>(`/v1/account/notifications/${notificationId}/read`);
  }

  /**
   * Mark all notifications as read
   * Required scope: account:write
   */
  async markAllNotificationsRead(): Promise<{ count: number }> {
    return this.client.put<{ count: number }>('/v1/account/notifications/read-all');
  }

  /**
   * Delete notification
   * Required scope: account:write
   */
  async deleteNotification(notificationId: string): Promise<void> {
    await this.client.delete(`/v1/account/notifications/${notificationId}`);
  }
}
