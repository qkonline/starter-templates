// Storing the passwordKey: a salted hash, self-describing, checked in constant time, and cheap
// enough for Workers Free's 10 ms of CPU.
import { describe, expect, it } from 'vitest';
import { fakeCtx } from '../test/fake-d1';
import { keyFor } from './routes/auth';
import { browserRoundsOf, checkPasswordKey, hashPasswordKey, ROUNDS } from './password';

const key = 'k'.repeat(43);
const other = 'j'.repeat(43);

describe('the stored password hash', () => {
  it('says how it was made, and never holds the key', async () => {
    const stored = await hashPasswordKey(key, 600_000);
    expect(stored).toMatch(new RegExp(`^pbkdf2-sha256\\$${ROUNDS}\\$[A-Za-z0-9_-]{22}\\$[A-Za-z0-9_-]{43}\\$600000$`));
    expect(stored).not.toContain(key);
  });

  it('takes the right key and refuses another', async () => {
    const stored = await hashPasswordKey(key, 600_000);
    expect(await checkPasswordKey(key, stored)).toEqual({ ok: true, rehash: false });
    expect(await checkPasswordKey(other, stored)).toEqual({ ok: false, rehash: false });
  });

  it('salts each one, so the same key never gives the same hash', async () => {
    expect(await hashPasswordKey(key, 600_000)).not.toBe(await hashPasswordKey(key, 600_000));
  });

  it('refuses no password, or one stored some way it does not know', async () => {
    for (const stored of [null, '', 'plain', `sha1$1$abc$def`, `pbkdf2-sha256$x$abc$def`, `pbkdf2-sha256$0$abc$def`])
      expect((await checkPasswordKey(key, stored)).ok).toBe(false);
  });

  it('asks for a new hash when the stored one has other settings', async () => {
    expect(await checkPasswordKey(key, await hashPasswordKey(key, 600_000, ROUNDS + 1))).toEqual({ ok: true, rehash: true });
  });

  it('costs well under a millisecond', async () => {
    const stored = await hashPasswordKey(key, 600_000);
    const n = 200;
    const start = process.cpuUsage();
    for (let i = 0; i < n; i++) await checkPasswordKey(key, stored);
    const used = process.cpuUsage(start);
    const ms = (used.user + used.system) / 1000 / n;
    console.log(`checkPasswordKey: ${ms.toFixed(3)} ms of CPU each`);
    expect(ms).toBeLessThan(1);
  });
});

describe("raising the browser's rounds", () => {
  it('a hash from before the rounds were written down was made with 600,000', async () => {
    const old = (await hashPasswordKey(key, 600_000)).split('$').slice(0, 4).join('$');
    expect(browserRoundsOf(old)).toBe(600_000);
    expect(await checkPasswordKey(key, old, 600_000)).toEqual({ ok: true, rehash: false });
  });

  it('while they change, the key made the way the hash was is checked, and the hash is made again', async () => {
    const { ctx } = fakeCtx({ PASSWORD_ITERATIONS: '1000000', PASSWORD_PREVIOUS_ITERATIONS: '600000' });
    const oldKey = key;
    const newKey = other;
    const stored = await hashPasswordKey(oldKey, 600_000);
    // The browser sends both; the one for 600,000 is the one this hash takes.
    const chosen = keyFor(ctx, stored, newKey, oldKey);
    expect(chosen).toBe(oldKey);
    expect(await checkPasswordKey(chosen, stored, ctx.cfg.passwordIterations)).toEqual({ ok: true, rehash: true });
    // Made again from the new key: from now on that's the one.
    const moved = await hashPasswordKey(newKey, ctx.cfg.passwordIterations);
    expect(keyFor(ctx, moved, newKey, oldKey)).toBe(newKey);
    expect(await checkPasswordKey(newKey, moved, ctx.cfg.passwordIterations)).toEqual({ ok: true, rehash: false });
  });

  it('too few rounds is refused when the Worker starts', () => {
    expect(() => fakeCtx({ PASSWORD_ITERATIONS: '1000' })).toThrow(/at least 100000/);
  });
});

