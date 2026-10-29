// Which network a request comes from, for per-network limits. An IPv4 address is one network;
// an IPv6 address is not, since a single home or phone is usually given a whole /64 and can pick
// any address in it, so IPv6 is counted by its first 64 bits.

/** The network an address belongs to: IPv4 as it is, IPv6 as its /64 ("2001:db8:0:1::/64"). */
export function networkOf(ip: string): string {
  const addr = ip.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  if (!addr.includes(':')) return addr;
  const groups = expand(addr);
  if (!groups) return addr;
  // An IPv4 address written as IPv6 (::ffff:192.0.2.1) is that IPv4 address.
  if (groups.slice(0, 5).every((g) => /^0+$/.test(g)) && groups[5] === 'ffff') {
    const n = (parseInt(groups[6]!, 16) << 16) | parseInt(groups[7]!, 16);
    return [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');
  }
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

/** The eight groups of an IPv6 address, or null if it isn't one. */
function expand(addr: string): string[] | null {
  const halves = addr.split('::');
  if (halves.length > 2) return null;
  const part = (s: string | undefined) => (s ? s.split(':') : []);
  const head = part(halves[0]);
  const tail = part(halves[1]);
  // A trailing IPv4 part counts as two groups.
  const last = tail.length ? tail : head;
  const v4 = last.at(-1)?.includes('.') ? last.pop()! : null;
  if (v4) {
    const b = v4.split('.').map(Number);
    if (b.length !== 4 || b.some((n) => !(n >= 0 && n <= 255))) return null;
    last.push(((b[0]! << 8) | b[1]!).toString(16), ((b[2]! << 8) | b[3]!).toString(16));
  }
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 1 ? 0 : missing).fill('0'), ...tail];
  return groups.every((g) => /^[0-9a-f]{1,4}$/.test(g)) ? groups : null;
}
