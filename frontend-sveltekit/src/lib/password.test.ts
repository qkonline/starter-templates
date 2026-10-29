import { describe, expect, it } from 'vitest';
import { passwordKey } from '@starter/contract/password';
import { ITERATIONS, emailProblem, makeKey, passwordProblem } from './password';

describe('password rules', () => {
  it('enforces the minimum length from /auth/methods', () => {
    expect(passwordProblem('', 8)).toMatch(/Enter/);
    expect(passwordProblem('1234567', 8)).toMatch(/at least 8/);
    expect(passwordProblem('12345678', 8)).toBeNull();
    // Counted in characters, not UTF-16 units: four emoji are four characters.
    expect(passwordProblem('😀😀😀😀', 8)).toMatch(/at least 8/);
  });

  it('catches mistyped emails', () => {
    expect(emailProblem('')).toMatch(/Enter/);
    expect(emailProblem('alice')).toMatch(/doesn’t look/);
    expect(emailProblem(' alice@example.com ')).toBeNull();
  });
});

describe('makeKey', () => {
  it('is exactly the contract’s passwordKey', async () => {
    const settings = { saltPrefix: 'starter', iterations: ITERATIONS };
    const key = await makeKey('correct horse', ' Alice@Example.com', settings);
    expect(key).toBe(await passwordKey('correct horse', 'alice@example.com', settings));
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('differs per email, so changing the email needs both keys', async () => {
    const settings = { saltPrefix: 'starter', iterations: ITERATIONS };
    const a = await makeKey('pw-123456', 'a@example.com', settings);
    const b = await makeKey('pw-123456', 'b@example.com', settings);
    expect(a).not.toBe(b);
  });

  it('refuses any other number of rounds than the contract’s', async () => {
    for (const iterations of [1000, 599_999, 600_001])
      await expect(
        makeKey('pw-123456', 'a@example.com', { saltPrefix: 'starter', iterations }),
      ).rejects.toThrow(/unsafe password settings/);
  });
});
