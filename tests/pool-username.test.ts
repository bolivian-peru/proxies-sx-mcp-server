import { describe, it, expect, vi } from 'vitest';
import { buildPoolUsername, gatewayUrl } from '../src/tools/pool.js';
import { parseUsername } from './fixtures/username-parser.live.js';

/** Parse with the live gateway grammar; a correction means the gateway had to repair the username. */
function parsed(username: string) {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const result = parseUsername(username);
  warn.mockRestore();
  expect(result.success).toBe(true);
  expect(result.data?.corrections).toBeUndefined();
  return result.data!;
}

describe('pool_build_proxy_url against the live gateway parser', () => {
  it('emits pool any, country any when nothing is chosen', () => {
    const { username, warnings } = buildPoolUsername('psx_abc123');
    expect(username).toBe('psx_abc123-any-any');
    expect(warnings).toEqual([]);
    expect(parsed(username)).toMatchObject({ accountId: 'psx_abc123', pool: 'any', country: 'ANY', rotation: 'auto10' });
  });

  it.each([
    ['mobile', 'mobile', 'mobile'],
    ['residential', 'residential', 'residential'],
    ['isp', 'isp', 'datacenter'],
    ['datacenter', 'isp', 'datacenter'],
  ] as const)('ipType %s is emitted as -iptype-%s and parsed as %s', (ipType, token, parsedAs) => {
    const { username } = buildPoolUsername('psx_abc123', { pool: 'peer', country: 'US', ipType });
    expect(username).toBe(`psx_abc123-peer-us-iptype-${token}`);
    // 'isp' is the customer name of the class the gateway stores as 'datacenter',
    // which the parser logs as an alias: silence that line here.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const data = parseUsername(username).data!;
    warn.mockRestore();
    expect(data.ipType).toBe(parsedAs);
    expect(data.pool).toBe('peer');
    expect(data.country).toBe('US');
  });

  it('round-trips every token unchanged', () => {
    const { username, warnings } = buildPoolUsername('psx_abc123', {
      pool: 'peer',
      country: 'de',
      city: 'berlin',
      state: 'be',
      carrier: 'telekom',
      ipType: 'residential',
      isp: 'vodafone',
      asn: 3320,
      sid: 'job_42',
      rotation: 'sticky',
      strict: true,
      failover: 'samecarrier',
      ttl: 7200,
    });
    expect(warnings).toEqual([]);
    expect(parsed(username)).toMatchObject({
      accountId: 'psx_abc123',
      pool: 'peer',
      country: 'DE',
      city: 'berlin',
      state: 'be',
      carrier: 'telekom',
      ipType: 'residential',
      isp: 'vodafone',
      asn: 3320,
      sessionId: 'job_42',
      rotation: 'sticky',
      strict: true,
      failover: 'samecarrier',
      ttl: 7200,
    });
  });

  it.each(['auto5', 'auto10', 'auto20', 'auto60', 'ondemand', 'sticky', 'hard'] as const)('rotation %s is read back as given', (rotation) => {
    const { username } = buildPoolUsername('psx_abc123', { pool: 'mbl', country: 'us', rotation, sid: 'a1' });
    expect(parsed(username).rotation).toBe(rotation);
  });

  it('reduces values to what the gateway keeps, so a hyphen cannot cut a token', () => {
    const { username } = buildPoolUsername('psx_abc123', { pool: 'peer', country: 'US', sid: 'My-Session 1', carrier: 'T-Mobile', city: 'New York' });
    expect(username).toBe('psx_abc123-peer-us-city-newyork-carrier-tmobile-sid-mysession1');
    expect(parsed(username)).toMatchObject({ sessionId: 'mysession1', carrier: 'tmobile', city: 'newyork' });
  });

  it('refuses a value with no usable characters and a malformed country or username', () => {
    expect(() => buildPoolUsername('psx_abc123', { sid: '---' })).toThrow(/no usable characters/);
    expect(() => buildPoolUsername('psx_abc123', { country: 'germany' })).toThrow(/2-letter/);
    expect(() => buildPoolUsername('psx_abc123-peer-us')).toThrow(/bare account username/);
  });

  it('refuses the mbl pool outside its six countries and allows it inside', () => {
    expect(() => buildPoolUsername('psx_abc123', { pool: 'mbl', country: 'de' })).toThrow(/US, GB, FR, NL, PL and GE \(Georgia\)/);
    for (const country of ['us', 'gb', 'fr', 'nl', 'pl', 'ge']) {
      expect(parsed(buildPoolUsername('psx_abc123', { pool: 'mbl', country }).username).pool).toBe('mbl');
    }
  });

  it('warns when sticky or auto rotation has no sid, and when iptype cannot match mbl', () => {
    expect(buildPoolUsername('psx_abc123', { pool: 'peer', country: 'us', rotation: 'sticky' }).warnings[0]).toMatch(/no sid/);
    expect(buildPoolUsername('psx_abc123', { pool: 'peer', country: 'us', rotation: 'auto20' }).warnings[0]).toMatch(/no sid/);
    expect(buildPoolUsername('psx_abc123', { pool: 'peer', country: 'us', rotation: 'ondemand' }).warnings).toEqual([]);
    expect(buildPoolUsername('psx_abc123', { pool: 'mbl', country: 'us', ipType: 'isp' }).warnings[0]).toMatch(/mobile only/);
  });

  it('never emits the -session- token the gateway ignores', () => {
    const { username } = buildPoolUsername('psx_abc123', { pool: 'peer', country: 'us', sid: 'x1', rotation: 'sticky' });
    expect(username).not.toContain('-session-');
    expect(parseUsername('psx_abc123-peer-us-session-x1').data?.sessionId).toBeUndefined();
  });

  it('builds the URL for each gateway port and encodes the password', () => {
    expect(gatewayUrl('http', 'psx_abc123-peer-us', 'p@ss:word')).toBe('http://psx_abc123-peer-us:p%40ss%3Aword@gw.proxies.sx:7000');
    expect(gatewayUrl('socks5', 'psx_abc123-peer-us', 'pak_x')).toBe('socks5h://psx_abc123-peer-us:pak_x@gw.proxies.sx:7001');
  });
});
