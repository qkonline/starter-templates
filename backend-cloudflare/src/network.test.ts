// Per-network limits count IPv6 by its /64, since one home can use any address in it.
import { describe, expect, it } from 'vitest';
import { networkOf } from './network';

describe('networkOf', () => {
  it('keeps an IPv4 address as it is', () => {
    expect(networkOf('192.0.2.7')).toBe('192.0.2.7');
    expect(networkOf('local')).toBe('local');
  });

  it('counts IPv6 by its first 64 bits, however it is written', () => {
    const net = '2001:db8:aa:1::/64';
    for (const ip of ['2001:db8:aa:1::1', '2001:0db8:00aa:0001:ffff:ffff:ffff:ffff', '2001:DB8:AA:1:0:0:0:9', '[2001:db8:aa:1::2]', '2001:db8:aa:1::5%eth0'])
      expect(networkOf(ip), ip).toBe(net);
    expect(networkOf('2001:db8:aa:2::1')).toBe('2001:db8:aa:2::/64');
    expect(networkOf('::1')).toBe('0:0:0:0::/64');
    expect(networkOf('2001:db8::')).toBe('2001:db8:0:0::/64');
  });

  it('treats an IPv4 address written as IPv6 as IPv4', () => {
    expect(networkOf('::ffff:192.0.2.7')).toBe('192.0.2.7');
  });

  it('leaves what is not an address alone', () => {
    expect(networkOf('1::2::3')).toBe('1::2::3');
    expect(networkOf('zz::1')).toBe('zz::1');
  });
});
