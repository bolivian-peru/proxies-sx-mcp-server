/**
 * Proxies.sx API Type Definitions
 * Complete TypeScript interfaces for all API responses
 */

// ============================================================================
// Common Types
// ============================================================================

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================================================
// Reference Data Types
// ============================================================================

export interface Country {
  _id: string;
  name: string;
  code: string;
  flag?: string;
  isActive: boolean;
}

export interface City {
  _id: string;
  name: string;
  countryId: string;
  isActive: boolean;
}

export interface Carrier {
  _id: string;
  name: string;
  countryId: string;
  isActive: boolean;
}

export interface Region {
  _id: string;
  name: string;
  countryId: string;
  isActive: boolean;
}

// ============================================================================
// Account Types
// ============================================================================

export interface SlotResource {
  total: number;
  used: number;
  available: number;
}

export interface TrafficResource {
  total: number;
  used: number;
  available: number;
}

export interface ResourceCategory {
  slots: SlotResource;
  trafficGB: TrafficResource;
  expiresAt?: number;
  daysRemaining?: number;
}

export interface AccountSummary {
  balance: number;
  currency: string;
  shared?: ResourceCategory;
  private?: ResourceCategory;
  alerts: string[];
}

export interface TrafficBalanceBreakdown {
  totalPayments: number;
  totalPurchases: number;
  trafficUsedMB: number;
  trafficUsedGB: number;
  purchasedTrafficGB: number;
  availableTrafficGB: number;
  pricePerGB: number;
  balance: number;
  currency: string;
  formula?: string;
}

// ============================================================================
// Port Types
// ============================================================================

export type PortType = 'shared' | 'private';
export type PortStatus = 'active' | 'suspended' | 'expired' | 'pending';
export type SyncStatus = 'synced' | 'pending_create' | 'pending_delete' | 'pending_apply' | 'orphaned_local' | 'orphaned_remote' | 'conflict';

export interface RotationSettings {
  enabled: boolean;
  intervalSeconds: number; // Interval in seconds (min 60 for private, min 300 for shared)
  matchCarrier: boolean;
  matchCity: boolean;
  lastRotatedAt: Date | string | null;
  rotationCount: number;
  excludedDeviceIds: string[];
}

export interface Port {
  _id: string;
  name: string; // ProxySmart portID - changes on rotation
  displayName?: string; // User-friendly name that never changes
  originalPortName?: string; // Original port name at creation
  customerId: string;
  deviceId: string | { _id: string; imei: string; [key: string]: unknown }; // May be populated

  // Connection details
  httpPort: number;
  socksPort: number;
  serverIp: string;
  proxyLogin: string;
  proxyPassword: string;

  // Location info (from populated device)
  countryId?: string;
  countryName?: string;
  cityId?: string;
  cityName?: string;
  carrierId?: string;
  carrierName?: string;
  regionId?: string;
  regionName?: string;

  // Status
  slotType: 'shared' | 'private'; // Type of port (determines traffic pool)
  status: string; // 'active', 'expiring_soon', 'expired', 'grace_period', 'deleted'
  suspended: boolean;
  syncStatus?: SyncStatus;
  healthStatus?: string;

  // OS Fingerprint
  osFingerprint?: string | null;

  // Rotation
  rotationToken?: string;
  rotationTokenExpiresAt?: string;
  rotationSettings?: RotationSettings;

  // Traffic
  lastTrafficIn: number;
  lastTrafficOut: number;
  baseTrafficIn: number;
  baseTrafficOut: number;
  lastTrafficCollectedAt?: string;

  // Timestamps
  expiresAt: number; // Unix timestamp in milliseconds
  createdAt?: number;
  updatedAt?: number;

  // Virtual populated fields
  device?: {
    _id: string;
    imei: string;
    countryId?: { name: string; code: string };
    carrierId?: { name: string };
    regionId?: { name: string };
    cityId?: { name: string };
  };
}

export interface PortStatusInfo {
  portId: string;
  isOnline: boolean;
  lastChecked: string;
  uptime?: number;
  deviceStatus?: string;
}

export interface PortIp {
  portId?: string;
  publicIp: string;
  serverIp: string;
  ip?: string; // Alias for publicIp
  country?: string;
  city?: string;
  isp?: string;
  checkedAt?: string;
}

export interface PingResult {
  portId?: string;
  success: boolean;
  ip?: string;
  responseTime?: number;
  latencyMs?: number; // Alias
  testTime?: string | Date;
  error?: string;
  checkedAt?: string;
}

export interface SpeedTestResult {
  portId: string;
  downloadMbps: number;
  uploadMbps: number;
  latencyMs: number;
  testedAt: string;
}

// ============================================================================
// Rotation Types
// ============================================================================

export type RotationTriggerType = 'manual' | 'automatic' | 'api_token';

export interface RotationHistoryEntry {
  _id: string;
  portId: string;
  previousDeviceId: string;
  newDeviceId: string;
  previousDeviceName?: string;
  newDeviceName?: string;
  trigger: RotationTriggerType;
  success: boolean;
  errorMessage?: string;
  rotatedAt: string;
}

export interface CanRotateResponse {
  canRotate: boolean;
  reason?: string;
  cooldownEndsAt?: string;
  nextAvailableRotation?: string;
}

// ============================================================================
// OS Fingerprint Types
// ============================================================================

export interface OsFingerprintOption {
  value: string;
  label: string;
  description?: string;
}

export const OS_FINGERPRINTS: OsFingerprintOption[] = [
  { value: '', label: 'None', description: 'No OS fingerprint spoofing' },
  { value: 'windows:1', label: 'Windows 10', description: 'Windows 10 fingerprint' },
  { value: 'macosx:3', label: 'macOS', description: 'macOS fingerprint' },
  { value: 'macosx:4', label: 'macOS (iPhone)', description: 'macOS iPhone fingerprint' },
  { value: 'ios:2', label: 'iOS (Real)', description: 'Real iOS fingerprint' },
  { value: 'ios:1', label: 'iOS (p0f)', description: 'iOS p0f fingerprint' },
  { value: 'android:3', label: 'Android (Real)', description: 'Real Android fingerprint' },
  { value: 'android:1', label: 'Android (p0f)', description: 'Android p0f fingerprint' },
];

// ============================================================================
// Billing Types
// ============================================================================

export type PurchaseType = 'slots' | 'traffic';
export type PurchaseCategory = 'shared' | 'private';
export type PaymentMethod = 'balance' | 'card' | 'crypto';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';

/**
 * Raw tariff from backend (before enhancement)
 */
export interface RawTariff {
  _id: string;
  type: string; // TariffType enum: 'Ports', 'Traffic', 'PortsShared', 'PortsPrivate', 'TrafficShared', 'TrafficPrivate'
  price: number;
  portRange?: { min: number; max: number } | null;
  trafficRange?: { min: number; max: number } | null;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * Enhanced tariff returned by the API (includes computed fields)
 */
export interface Tariff extends RawTariff {
  // Computed fields from backend
  category: 'shared' | 'private' | 'legacy';
  resourceType: 'ports' | 'traffic';
  pricePerUnit: number;
  unitType: 'slot' | 'gb';
  billingPeriod: 'monthly' | 'one-time';
  displayName: string;
  description: string;
}

export interface Purchase {
  _id: string;
  userId: string;
  type: PurchaseType;
  category: PurchaseCategory;
  quantity: number;
  pricePerUnit: number;
  totalPrice: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  stripePaymentIntentId?: string;
  createdAt: string;
  completedAt?: string;
}

export interface PurchaseRequest {
  type: PurchaseType;
  category: PurchaseCategory;
  quantity: number;
  paymentMethod: PaymentMethod;
}

export interface PurchaseResponse {
  purchase: Purchase;
  requiresAction?: boolean;
  clientSecret?: string;
  message?: string;
}

// ============================================================================
// Create Port Types
// ============================================================================

export interface CreatePortRequest {
  countryId: string;
  carrierId?: string;
  cityId?: string;
  regionId?: string;
  expiresAt: number; // seconds from now (60-31536000)
  isPrivate?: boolean; // true for private/dedicated device
  osFingerprint?: string;
}

export interface CreatePortResponse {
  port: Port;
  message: string;
}

// ============================================================================
// Update Port Types
// ============================================================================

export interface UpdateCredentialsRequest {
  proxyLogin?: string;
  proxyPassword?: string;
}

export interface UpdateRotationSettingsRequest {
  enabled?: boolean;
  intervalSeconds?: number; // Interval in seconds (min 60 for private, min 300 for shared, max 86400)
  matchCarrier?: boolean;
  matchCity?: boolean;
  excludedDeviceIds?: string[];
}

export interface ReconfigurePortRequest {
  countryId: string;
  carrierId?: string;
  cityId?: string;
  regionId?: string;
}

// ============================================================================
// Notification Types
// ============================================================================

export type NotificationType = 'info' | 'warning' | 'success' | 'error';
export type NotificationCategory = 'port' | 'billing' | 'account' | 'system';

export interface Notification {
  _id: string;
  userId: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  message: string;
  isRead: boolean;
  entityId?: string;
  entityType?: 'Port' | 'Purchase' | 'Payment' | 'User';
  metadata?: Record<string, unknown>;
  actionLink?: string;
  actionLabel?: string;
  expiresAt?: string;
  createdAt: string;
}

// ============================================================================
// API Key Types
// ============================================================================

export type ApiKeyScope =
  | 'ports:read'
  | 'ports:write'
  | 'ports:rotate'
  | 'billing:read'
  | 'billing:write'
  | 'account:read'
  | 'account:write'
  | 'traffic:read'
  | 'tickets:read'
  | 'tickets:write'
  | 'admin:full';

export interface ApiKey {
  _id: string;
  name: string;
  keyPrefix: string;
  scopes: ApiKeyScope[];
  lastUsedAt?: string;
  expiresAt?: string;
  isActive: boolean;
  createdAt: string;
}

// ============================================================================
// Traffic Types
// ============================================================================

export interface TrafficRecord {
  portId: string;
  bytesIn: number;
  bytesOut: number;
  timestamp: string;
}

export interface TrafficSummary {
  totalBytesIn: number;
  totalBytesOut: number;
  totalGB: number;
  period: {
    from: string;
    to: string;
  };
}
