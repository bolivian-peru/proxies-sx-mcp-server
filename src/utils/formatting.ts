/**
 * Formatting Utilities
 * Helper functions for formatting output
 */

import type { Port, AccountSummary, RotationHistoryEntry } from '../api/types.js';

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
 * Both ready-to-use connection strings of a port
 */
export function formatPortConnection(port: Port): string {
  return [
    'Connection Strings (ready to use):',
    `  HTTP:   ${buildProxyConnectionString(port, port.serverIp, 'http')}`,
    `  SOCKS5: ${buildProxyConnectionString(port, port.serverIp, 'socks5')}`,
  ].join('\n');
}

/**
 * Location of the device behind a port
 */
function portLocation(port: Port) {
  const device = port.device ?? (typeof port.deviceId === 'object' ? port.deviceId : undefined);
  return {
    country: device?.country?.name,
    carrier: device?.carrier?.name,
    city: device?.city?.name,
  };
}

/**
 * Format port summary
 */
export function formatPortSummary(port: Port): string {
  const { country, carrier, city } = portLocation(port);

  const lines = [
    `Port: ${port.displayName || port.name}`,
    `ID: ${port._id}`,
    `Status: ${port.status}${port.suspended ? ' (suspended)' : ''}`,
  ];

  if (country) {
    lines.push(`Country: ${country}`);
  }
  if (carrier) {
    lines.push(`Carrier: ${carrier}`);
  }
  if (city) {
    lines.push(`City: ${city}`);
  }

  lines.push(`HTTP Port: ${port.httpPort}`);
  lines.push(`SOCKS5 Port: ${port.socksPort}`);
  lines.push(`Server: ${port.serverIp}`);
  lines.push(`Port Expires: ${formatRelativeTime(new Date(port.expiresAt))}`);

  if (port.rotationSettings?.enabled) {
    const intervalMinutes = Math.round(port.rotationSettings.intervalSeconds / 60);
    lines.push(`Auto-rotation: every ~${intervalMinutes} min`);
  } else {
    lines.push('Auto-rotation: off (the port stays on its device until you rotate it)');
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
    lines.push('Resources:');
    lines.push(`  Port slots: ${s.slots.used}/${s.slots.total} (${s.slots.available} available)`);
    lines.push(`  Traffic: ${formatGB(s.trafficGB.used)}/${formatGB(s.trafficGB.total)} (${formatGB(s.trafficGB.available)} available)`);
    if (s.daysRemaining != null) {
      lines.push(`  Expires: ${s.daysRemaining} days remaining`);
    }
  }

  if (account.alerts && account.alerts.length > 0) {
    lines.push('');
    lines.push('Alerts:');
    account.alerts.forEach(a => lines.push(`  - [${a.severity}] ${a.message}`));
  }

  return lines.join('\n');
}

/**
 * Format rotation history entry
 */
export function formatRotationEntry(entry: RotationHistoryEntry): string {
  const status = entry.success ? 'success' : `failed: ${entry.errorMessage || 'unknown reason'}`;
  const where = [entry.country, entry.carrier, entry.city].filter(Boolean).join(' / ') || 'location not recorded';
  const took = entry.rotationDurationMs != null ? `, ${entry.rotationDurationMs} ms` : '';

  return `[${formatDate(entry.createdAt)}] ${entry.triggerType}: now on ${where} (${status}${took})`;
}

/**
 * Format port list as table
 */
export function formatPortTable(ports: Port[]): string {
  if (ports.length === 0) {
    return 'No ports found.';
  }

  const headers = ['Name', 'Status', 'Country', 'Carrier', 'Expires', 'Auto-rotation'];
  const rows = ports.map(p => {
    const { country, carrier } = portLocation(p);
    const rotation = p.rotationSettings?.enabled && p.rotationSettings.intervalSeconds
      ? `${Math.round(p.rotationSettings.intervalSeconds / 60)}m`
      : 'off';

    return [
      p.displayName || p.name,
      p.status + (p.suspended ? ' (sus)' : ''),
      country || '-',
      carrier || '-',
      formatRelativeTime(new Date(p.expiresAt)),
      rotation,
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
