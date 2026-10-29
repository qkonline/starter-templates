// Storing the passwordKey: a salted hash, self-describing, checked in constant time, and cheap
// enough for Workers Free's 10 ms of CPU.
import { describe, expect, it } from 'vitest';
import { checkPasswordKey, hashPasswordKey, ROUNDS } from './password';

const key = 'k'.repeat(43);
const other = 'j'.repeat(43);

describe('the stored password hash', () => {
  it('says how it was made, and never holds the key', async () => {
    const stored = await hashPasswordKey(key);
    expect(stored).toMatch(new RegExp(`^pbkdf2-sha256\\$${ROUNDS}\\$[A-Za-z0-9_-]{22}\\$[A-Za-z0-9_-]{43}$`));
    expect(stored).not.toContain(key);
  });

  it('takes the right key and refuses another', async () => {
    const stored = await hashPasswordKey(key);
    expect(await checkPasswordKey(key, stored)).toEqual({ ok: true, rehash: false });
    expect(await checkPasswordKey(other, stored)).toEqual({ ok: false, rehash: false });
  });

  it('salts each one, so the same key never gives the same hash', async () => {
    expect(await hashPasswordKey(key)).not.toBe(await hashPasswordKey(key));
  });

  it('refuses no password, or one stored some way it does not know', async () => {
    for (const stored of [null, '', 'plain', `sha1$1$abc$def`, `pbkdf2-sha256$x$abc$def`, `pbkdf2-sha256$0$abc$def`])
      expect((await checkPasswordKey(key, stored)).ok).toBe(false);
  });

  it('asks for a new hash when the stored one has other settings', async () => {
    expect(await checkPasswordKey(key, await hashPasswordKey(key, ROUNDS + 1))).toEqual({ ok: true, rehash: true });
  });

  it('costs well under a millisecond', async () => {
    const stored = await hashPasswordKey(key);
    const n = 200;
    const start = process.cpuUsage();
    for (let i = 0; i < n; i++) await checkPasswordKey(key, stored);
    const used = process.cpuUsage(start);
    const ms = (used.user + used.system) / 1000 / n;
    console.log(`checkPasswordKey: ${ms.toFixed(3)} ms of CPU each`);
    expect(ms).toBeLessThan(1);
  });
});
