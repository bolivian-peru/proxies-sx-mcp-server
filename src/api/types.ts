/**
 * Proxies.sx API Type Definitions
 * Response shapes of the routes the tools call, as production returns them.
 */

// ============================================================================
// Reference Data Types
// ============================================================================

export interface NamedRef {
  _id: string;
  name: string;
}

export interface Country extends NamedRef {
  code: string;
}

/** A country, carrier or city that has free dedicated-port devices right now. */
export type WithFreeDevices<T> = T & { freeDeviceCount: number };

// ============================================================================
// Account Types
// ============================================================================

export interface ResourceUsage {
  total: number;
  used: number;
  available: number;
}

export interface AccountAlert {
  type: string;
  message: string;
  severity: string;
}

export interface AccountSummary {
  balance: number;
  currency: string;
  shared?: {
    slots: ResourceUsage;
    trafficGB: ResourceUsage;
    expiresAt?: number | null;
    daysRemaining?: number | null;
  };
  alerts: AccountAlert[];
}

export interface TrafficBalanceBreakdown {
  trafficUsedGB: number;
  purchasedTrafficGB: number;
  availableTrafficGB: number;
  balance: number;
  currency: string;
}

export interface TrafficUsage {
  total: { inMB: number; outMB: number; totalMB: number; totalGB: number };
  /** `portId` is `gw_pool` for Pool Gateway traffic, a port id otherwise. */
  byPort: Array<{ portId: string; inMB: number; outMB: number; totalMB: number; totalGB: number }>;
}

// ============================================================================
// Port Types
// ============================================================================

export interface RotationSettings {
  enabled: boolean;
  intervalSeconds: number; // minimum 300 on the shared ports the API sells
  matchCarrier: boolean;
  matchCity: boolean;
  lastRotatedAt: Date | string | null;
  rotationCount: number;
}

export interface PortDevice {
  country?: { name: string; code?: string };
  carrier?: { name: string };
  city?: { name: string };
}

export interface Port {
  _id: string;
  name: string; // modem-side port id, changes on rotation
  displayName?: string; // user-facing name that never changes
  /** The device behind the port with its location: GET /v1/ports/:id populates it here ... */
  deviceId?: string | PortDevice;
  /** ... and GET /v1/ports under this name. */
  device?: PortDevice;

  // Connection details
  httpPort: number;
  socksPort: number;
  serverIp: string;
  proxyLogin: string;
  proxyPassword: string;

  // Status
  status: string; // 'active', 'expiring_soon', 'expired', 'grace_period', 'deleted'
  suspended: boolean;

  osFingerprint?: string | null;

  // Rotation
  rotationToken?: string;
  rotationSettings?: RotationSettings;

  expiresAt: number; // Unix timestamp in milliseconds
}

export interface PortStatusInfo {
  status: string; // 'online' | 'offline' | 'expired'
  isActive: boolean;
  lastChecked: string;
  expiresAt: number;
}

export interface PortIp {
  /** Always 'hidden' for customers: the API never returns an exit IP. */
  publicIp: string;
  serverIp: string;
}

export interface PingResult {
  success: boolean;
  responseTime?: number;
  testTime?: string | Date;
  error?: string;
}

export interface SpeedTestResult {
  downloadSpeed: number;
  uploadSpeed: number;
  ping: number;
  testTime: string;
}

export interface ExtendPortResult {
  success: boolean;
  message: string;
  newExpiresAt: number;
}

export interface MaxExtendHours {
  maxHoursAllowed: number;
  currentExpiresAt: number;
  maxExpiresAt: number;
}

// ============================================================================
// Rotation Types
// ============================================================================

export interface RotateResult {
  success: boolean;
  portId: string;
  rotationDurationMs?: number;
  rotationCount?: number;
  message?: string;
}

export interface RotationHistoryEntry {
  triggerType: string; // 'manual' | 'automatic' | 'api_token'
  success: boolean;
  errorMessage?: string;
  rotationDurationMs?: number;
  country?: string;
  carrier?: string;
  city?: string;
  createdAt: string;
}

export interface RotationHistory {
  rotations: RotationHistoryEntry[];
  total: number;
}

export interface CanRotateResponse {
  canRotate: boolean;
  reason?: string;
  nextRotationAt?: string;
  cooldownRemaining?: number; // seconds
  availableDevices?: number;
}

// ============================================================================
// Billing Types
// ============================================================================

export interface VolumeDiscount {
  minGB: number;
  maxGB: number | null;
  discountPercent: number;
}

/** Port slots are free and unlock with cumulative GB purchased. */
export interface SlotTier {
  name: string;
  minGB: number;
  sharedSlots: number;
}

export interface UserTierInfo {
  currentTier: SlotTier;
  nextTier: SlotTier | null;
  cumulativeGB: number;
  gbToNextTier: number;
  sharedSlotLimit: number;
}

/** GET /v1/billing/pricing */
export interface PricingInfo {
  basePrices: { shared: number };
  volumeDiscounts: VolumeDiscount[];
  slotTiers: SlotTier[];
  userTierInfo: UserTierInfo | null;
}

/** GET /v1/billing/calculate-price */
export interface PriceCalculation {
  basePrice: number;
  discountPercent: number;
  pricePerGB: number;
  totalPrice: number;
  amount: number;
}

/** POST /v1/billing/purchase-traffic returns the purchase document. */
export interface Purchase {
  _id: string;
  amount: number; // GB
  price: number; // USD charged to the balance
}

// ============================================================================
// Request Types
// ============================================================================

export interface CreatePortRequest {
  countryId: string;
  carrierId?: string;
  cityId?: string;
  expiresAt: number; // seconds from now (60-31536000)
  osFingerprint?: string;
}

export interface UpdateCredentialsRequest {
  proxyLogin?: string;
  proxyPassword?: string;
}

export interface UpdateRotationSettingsRequest {
  enabled?: boolean;
  intervalSeconds?: number; // 300-86400
  matchCarrier?: boolean;
  matchCity?: boolean;
}

export interface ReconfigurePortRequest {
  countryId: string;
  carrierId?: string;
  cityId?: string;
}
