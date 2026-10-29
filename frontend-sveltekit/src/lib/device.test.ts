import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
}

// A fresh module for each test, as for a new tab: it remembers in memory whether the tab has
// held a support session.
let device: typeof import('./device');
let forgetDevice: typeof device.forgetDevice;
let keepSession: typeof device.keepSession;
let onForget: typeof device.onForget;
let readToken: typeof device.readToken;
let writeToken: typeof device.writeToken;

beforeEach(async () => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.stubGlobal('sessionStorage', new MemoryStorage());
  vi.resetModules();
  device = await import('./device');
  ({ forgetDevice, keepSession, onForget, readToken, writeToken } = device);
});
afterEach(() => vi.unstubAllGlobals());

describe('what the device keeps', () => {
  it('stores and clears the token', () => {
    expect(readToken()).toBeNull();
    writeToken('t1');
    expect(readToken()).toBe('t1');
    writeToken(null);
    expect(readToken()).toBeNull();
  });

  it('keeps the previous data when the same account signs in again', async () => {
    await keepSession('t1', 'alice');
    localStorage.setItem('app:drafts', 'alice’s draft');
    writeToken(null);
    expect(await keepSession('t2', 'alice')).toBe(false);
    expect(localStorage.getItem('app:drafts')).toBe('alice’s draft');
    expect(readToken()).toBe('t2');
  });

  it('forgets everything of the previous person when another account signs in', async () => {
    const cleaned = vi.fn();
    const stop = onForget(cleaned);
    await keepSession('t1', 'alice');
    localStorage.setItem('app:drafts', 'alice’s draft');
    sessionStorage.setItem('app:scroll', '400');
    expect(await keepSession('t2', 'bob')).toBe(true);
    expect(localStorage.getItem('app:drafts')).toBeNull();
    expect(sessionStorage.getItem('app:scroll')).toBeNull();
    expect(cleaned).toHaveBeenCalledTimes(1);
    expect(readToken()).toBe('t2');
    stop();
  });

  it('wipes everything on forgetDevice, even if a cleaner fails', async () => {
    const stop = onForget(() => Promise.reject(new Error('IndexedDB blocked')));
    writeToken('t1');
    await expect(forgetDevice()).resolves.toBeUndefined();
    expect(readToken()).toBeNull();
    stop();
  });
});

describe('support sessions', () => {
  it('use the tab’s token and leave the device’s own session alone', async () => {
    const { endSupport, inSupport, readSupport, startSupport } = device;
    writeToken('admin-token');
    startSupport({ token: 'support-token', email: 'p@x.test' });
    expect(inSupport()).toBe(true);
    expect(readSupport()).toEqual({ token: 'support-token', email: 'p@x.test' });
    expect(readToken()).toBe('support-token');
    expect(localStorage.getItem('starter:token')).toBe('admin-token');
    expect(sessionStorage.getItem('starter:token')).toBeNull();

    // Signed out in the support tab: only the support session goes.
    writeToken(null);
    expect(inSupport()).toBe(false);
    expect(readToken()).toBe('admin-token');

    startSupport({ token: 'support-token', email: 'p@x.test' });
    endSupport();
    expect(readToken()).toBe('admin-token');
  });

  it('never write the admin’s session, even after the support session ended', async () => {
    const { endSupport, isSupportTab, startSupport } = device;
    writeToken('admin-token');
    localStorage.setItem('starter:account', 'admin');
    startSupport({ token: 'support-token', email: 'p@x.test' });
    endSupport();
    expect(isSupportTab()).toBe(true);
    writeToken(null);
    writeToken('someone-else');
    await expect(keepSession('someone-else', 'bob')).rejects.toThrow(/support session/);
    await forgetDevice();
    expect(localStorage.getItem('starter:token')).toBe('admin-token');
    expect(localStorage.getItem('starter:account')).toBe('admin');
    expect(isSupportTab()).toBe(true);
  });

  it('never clear the admin’s device when forgetting', async () => {
    const { startSupport } = device;
    writeToken('admin-token');
    localStorage.setItem('app:drafts', 'admin draft');
    startSupport({ token: 's', email: 'p@x.test' });
    await forgetDevice();
    expect(localStorage.getItem('starter:token')).toBe('admin-token');
    expect(localStorage.getItem('app:drafts')).toBe('admin draft');
    expect(sessionStorage.getItem('starter:support')).toBeNull();
  });

  it('ignore a damaged entry', async () => {
    const { readSupport } = device;
    sessionStorage.setItem('starter:support', '{not json');
    expect(readSupport()).toBeNull();
    sessionStorage.setItem('starter:support', JSON.stringify({ token: '', email: 'x' }));
    expect(readSupport()).toBeNull();
  });
});

describe('device settings', () => {
  it('stay when the device forgets the previous person', async () => {
    localStorage.setItem('starter:theme', 'dark');
    localStorage.setItem('starter:text', 'lg');
    localStorage.setItem('app:drafts', 'x');
    await forgetDevice();
    expect(localStorage.getItem('starter:theme')).toBe('dark');
    expect(localStorage.getItem('starter:text')).toBe('lg');
    expect(localStorage.getItem('app:drafts')).toBeNull();
  });
});
