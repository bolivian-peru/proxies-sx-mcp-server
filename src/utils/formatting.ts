/**
 * Formatting Utilities
 * Helper functions for formatting output
 */

import type { Port, AccountSummary, Tariff, RotationHistoryEntry } from '../api/types.js';

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);

  return `${value.toFixed(2)} ${units[i]}`;
}

/**
 * Format GB to human readable string
 */
export function formatGB(gb: number): string {
  if (gb >= 1000) {
    return `${(gb / 1000).toFixed(2)} TB`;
  }
  return `${gb.toFixed(2)} GB`;
}

/**
 * Format currency
 */
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Format date to ISO string
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString();
}

/**
 * Format relative time
 */
export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays > 0) {
    return `in ${diffDays} day${diffDays === 1 ? '' : 's'}`;
  } else if (diffDays < 0) {
    return `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'} ago`;
  }
  return 'today';
}

/**
 * Build proxy connection string
 */
export function buildProxyConnectionString(
  port: Port,
  serverHost: string,
  protocol: 'http' | 'socks5' = 'http'
): string {
  const portNumber = protocol === 'http' ? port.httpPort : port.socksPort;
  return `${protocol}://${port.proxyLogin}:${port.proxyPassword}@${serverHost}:${portNumber}`;
}

/**
 * Format port summary
 */
export function formatPortSummary(port: Port): string {
  // Get location info from port or populated device
  let countryName = port.countryName;
  let carrierName = port.carrierName;
  let cityName = port.cityName;

  // If device is populated, extract location from it
  if (port.device) {
    countryName = countryName || port.device.countryId?.name;
    carrierName = carrierName || port.device.carrierId?.name;
    cityName = cityName || port.device.cityId?.name;
  }

  const lines = [
    `Port: ${port.displayName || port.name}`,
    `ID: ${port._id}`,
    `Type: ${port.slotType}`,
    `Status: ${port.status}${port.suspended ? ' (suspended)' : ''}`,
  ];

  if (countryName) {
    lines.push(`Country: ${countryName}`);
  }
  if (carrierName) {
    lines.push(`Carrier: ${carrierName}`);
  }
  if (cityName) {
    lines.push(`City: ${cityName}`);
  }

  lines.push(`HTTP Port: ${port.httpPort}`);
  lines.push(`SOCKS5 Port: ${port.socksPort}`);
  lines.push(`Server: ${port.serverIp}`);

  // Format expiration - expiresAt is Unix timestamp (slot expiry)
  const expiresDate = new Date(port.expiresAt);
  lines.push(`Slot Expires: ${formatRelativeTime(expiresDate)}`);

  // Note: Session duration (how long each connection stays alive) is controlled by the
  // proxy server settings, typically via auto-rotation interval. If auto-rotation is disabled,
  // sessions persist until the slot expires or the device reconnects.
  if (port.rotationSettings?.enabled) {
    const intervalMinutes = Math.round(port.rotationSettings.intervalSeconds / 60);
    lines.push(`Session Duration: ~${intervalMinutes} min (auto-rotation enabled)`);
  } else {
    lines.push(`Session Duration: Persistent (manual rotation only)`);
  }

  return lines.join('\n');
}

/**
 * Format account summary
 */
export function formatAccountSummary(account: AccountSummary): string {
  const lines = [
    `Balance: ${formatCurrency(account.balance, account.currency)}`,
  ];

  if (account.shared) {
    const s = account.shared;
    lines.push('');
    lines.push('Shared Resources:');
    lines.push(`  Slots: ${s.slots.used}/${s.slots.total} (${s.slots.available} available)`);
    lines.push(`  Traffic: ${formatGB(s.trafficGB.used)}/${formatGB(s.trafficGB.total)} (${formatGB(s.trafficGB.available)} available)`);
    if (s.daysRemaining !== undefined) {
      lines.push(`  Expires: ${s.daysRemaining} days remaining`);
    }
  }

  if (account.private) {
    const p = account.private;
    lines.push('');
    lines.push('Private Resources:');
    lines.push(`  Slots: ${p.slots.used}/${p.slots.total} (${p.slots.available} available)`);
    lines.push(`  Traffic: ${formatGB(p.trafficGB.used)}/${formatGB(p.trafficGB.total)} (${formatGB(p.trafficGB.available)} available)`);
    if (p.daysRemaining !== undefined) {
      lines.push(`  Expires: ${p.daysRemaining} days remaining`);
    }
  }

  if (account.alerts && account.alerts.length > 0) {
    lines.push('');
    lines.push('Alerts:');
    account.alerts.forEach(a => lines.push(`  - ${a}`));
  }

  return lines.join('\n');
}

/**
 * Format tariff info
 */
export function formatTariff(tariff: Tariff): string {
  // Get quantity range based on tariff type
  let quantityRange = '';
  if (tariff.resourceType === 'ports' && tariff.portRange) {
    const min = tariff.portRange.min || 1;
    const max = tariff.portRange.max;
    quantityRange = max ? `${min}-${max}` : `${min}+`;
  } else if (tariff.resourceType === 'traffic' && tariff.trafficRange) {
    const min = tariff.trafficRange.min || 1;
    const max = tariff.trafficRange.max;
    quantityRange = max ? `${min}-${max}` : `${min}+`;
  }

  const unit = tariff.unitType === 'gb' ? 'GB' : 'slot';
  const rangeStr = quantityRange ? ` (${quantityRange} ${unit}s)` : '';

  return `${tariff.displayName}: ${formatCurrency(tariff.pricePerUnit)}/${unit}${rangeStr}`;
}

/**
 * Format rotation history entry
 */
export function formatRotationEntry(entry: RotationHistoryEntry): string {
  const status = entry.success ? 'Success' : `Failed: ${entry.errorMessage}`;
  const trigger = entry.trigger.charAt(0).toUpperCase() + entry.trigger.slice(1);

  return `[${formatDate(entry.rotatedAt)}] ${trigger}: ${entry.previousDeviceName || 'Unknown'} → ${entry.newDeviceName || 'Unknown'} (${status})`;
}

/**
 * Format port list as table
 * NOTE: Port expiration (expiresAt) is the slot expiry - when the port stops working.
 * Session duration is a separate concept - how long each proxy connection stays alive.
 */
export function formatPortTable(ports: Port[]): string {
  if (ports.length === 0) {
    return 'No ports found.';
  }

  const headers = ['Name', 'Type', 'Status', 'Country', 'Slot Expires', 'Session'];
  const rows = ports.map(p => {
    // Get location info from port or populated device
    let countryName = p.countryName;

    if (p.device) {
      countryName = countryName || p.device.countryId?.name;
    }

    const expiresDate = new Date(p.expiresAt);

    // Session duration based on rotation settings
    let sessionInfo = 'Persistent';
    if (p.rotationSettings?.enabled && p.rotationSettings.intervalSeconds) {
      const mins = Math.round(p.rotationSettings.intervalSeconds / 60);
      sessionInfo = `${mins}m auto`;
    }

    return [
      p.displayName || p.name,
      p.slotType,
      p.status + (p.suspended ? ' (sus)' : ''),
      countryName || '-',
      formatRelativeTime(expiresDate),
      sessionInfo,
    ];
  });

  // Calculate column widths
  const widths = headers.map((h, i) => {
    return Math.max(h.length, ...rows.map(r => r[i].length));
  });

  // Format header
  const headerRow = headers.map((h, i) => h.padEnd(widths[i])).join(' | ');
  const separator = widths.map(w => '-'.repeat(w)).join('-+-');

  // Format rows
  const dataRows = rows.map(row =>
    row.map((cell, i) => cell.padEnd(widths[i])).join(' | ')
  );

  // Add full port IDs for easy copy/paste
  const portIds = ports.map(p => `  ${p.displayName || p.name}: ${p._id}`).join('\n');

  return [headerRow, separator, ...dataRows, '', 'Port IDs:', portIds].join('\n');
}
