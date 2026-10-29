// VAPID signatures, push encryption (RFC 8291) checked by decrypting as a browser would, and what
// happens to a subscription when its push service answers.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeCtx } from '../test/fake-d1';
import { b64url, fromB64url } from './crypto';
import { pushTo } from './notify';
import { encryptPush, isPushEndpoint, pushKeys, readSome } from './push';
import { vapidAuthorization } from './vapid';

const subtle = crypto.subtle;

async function vapid() {
  const pair = (await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const publicKey = b64url((await subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
  const { d } = (await subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
  return { pair, keys: { publicKey, privateKey: d!, subject: 'mailto:dev@example.test' } };
}

/** A browser: its key pair and secret, and the subscription keys it would hand over. */
async function browser() {
  const pair = (await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const raw = new Uint8Array((await subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
  const secret = crypto.getRandomValues(new Uint8Array(16));
  return { pair, raw, secret, sub: { p256dh: b64url(raw), auth: b64url(secret) } };
}

const hmac = async (key: Uint8Array, data: Uint8Array) =>
  new Uint8Array(await subtle.sign('HMAC', await subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), data as BufferSource));
const join = (...p: Uint8Array[]) => Uint8Array.from(p.flatMap((x) => [...x]));
const text = (s: string) => new TextEncoder().encode(s);

/** RFC 8291 decryption, written apart from encryptPush, as the browser does it. */
async function decrypt(b: Awaited<ReturnType<typeof browser>>, body: Uint8Array) {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0);
  const idlen = body[20]!;
  const asPublic = body.slice(21, 21 + idlen);
  const sealed = body.slice(21 + idlen);
  const asKey = await subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  // Web Crypto names the peer key `public`; the Workers types call it `$public`.
  const ecdh = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: asKey } as unknown as SubtleCryptoDeriveKeyAlgorithm, b.pair.privateKey, 256));
  const ikm = await hmac(await hmac(b.secret, ecdh), join(text('WebPush: info\0'), b.raw, asPublic, Uint8Array.of(1)));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, join(text('Content-Encoding: aes128gcm\0'), Uint8Array.of(1)))).slice(0, 16);
  const nonce = (await hmac(prk, join(text('Content-Encoding: nonce\0'), Uint8Array.of(1)))).slice(0, 12);
  const key = await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, sealed));
  return { rs, idlen, delimiter: plain.at(-1), message: new TextDecoder().decode(plain.slice(0, -1)) };
}

describe('vapidAuthorization', () => {
  it('signs a JWT for the push service that verifies with the public key', async () => {
    const { pair, keys } = await vapid();
    const now = 1_790_000_000_000;
    const auth = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', keys, now);
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(auth)!;
    expect(m).not.toBeNull();
    const [, h, c, sig, k] = m;
    expect(k).toBe(keys.publicKey);
    expect(JSON.parse(new TextDecoder().decode(fromB64url(h!)))).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(JSON.parse(new TextDecoder().decode(fromB64url(c!)))).toEqual({ aud: 'https://fcm.googleapis.com', exp: now / 1000 + 3600, sub: keys.subject });
    expect(await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, fromB64url(sig!), text(`${h}.${c}`))).toBe(true);
  });
});

describe('encryptPush', () => {
  it('only the browser it was made for can read it', async () => {
    const b = await browser();
    const message = JSON.stringify({ title: 'Hello', body: 'From the test', url: '/teams/x' });
    const body = await encryptPush(b.sub, text(message));
    const out = await decrypt(b, body);
    expect(out).toEqual({ rs: 4096, idlen: 65, delimiter: 2, message });
    await expect(decrypt(await browser(), body)).rejects.toThrow();
  });

  it('is different every time: a fresh key pair and salt', async () => {
    const b = await browser();
    const one = await encryptPush(b.sub, text('same'));
    const two = await encryptPush(b.sub, text('same'));
    expect(b64url(one)).not.toBe(b64url(two));
  });

  it('refuses a message too long for one record', async () => {
    const b = await browser();
    await expect(encryptPush(b.sub, new Uint8Array(4096))).rejects.toThrow();
  });
});

describe('subscriptions', () => {
  it('takes https endpoints only', () => {
    expect(isPushEndpoint('https://web.push.apple.com/abc')).toBe(true);
    expect(isPushEndpoint('http://fcm.googleapis.com/x')).toBe(false);
    expect(isPushEndpoint('not a url')).toBe(false);
    expect(isPushEndpoint(`https://fcm.googleapis.com/${'a'.repeat(2048)}`)).toBe(false);
  });

  it('takes only the known push services, and extra hosts only when given', () => {
    for (const ok of [
      'https://fcm.googleapis.com/fcm/send/abc',
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://wns2-db5p.notify.windows.com/w/?token=abc',
      'https://web.push.apple.com/abc',
      'https://api.push.apple.com/abc',
    ])
      expect(isPushEndpoint(ok), ok).toBe(true);
    for (const no of [
      'https://push.invalid/x',
      'https://evil.test/fcm.googleapis.com',
      'https://fcm.googleapis.com.evil.test/x',
      'https://push.apple.com/x',
      'https://notify.windows.com/x',
      'https://fcm.googleapis.com:8443/x',
      'https://169.254.169.254/latest',
    ])
      expect(isPushEndpoint(no), no).toBe(false);
    expect(isPushEndpoint('https://push.invalid/x', ['push.invalid'])).toBe(true);
  });

  it('reads extra push hosts only on a local API', () => {
    expect(fakeCtx({ PUSH_EXTRA_HOSTS: 'push.invalid' }).ctx.cfg.pushExtraHosts).toEqual(['push.invalid']);
    expect(fakeCtx({ PUSH_EXTRA_HOSTS: 'push.invalid' }, { api: 'https://api.example.com/api' }).ctx.cfg.pushExtraHosts).toEqual([]);
  });

  it('reads at most so much of a refused push\'s answer', async () => {
    expect(await readSome(new Response('x'.repeat(100_000)), 500)).toBe('x'.repeat(500));
    expect(await readSome(new Response('short'), 500)).toBe('short');
    expect(await readSome(new Response(null), 500)).toBe('');
  });

  it('takes keys of the sizes RFC 8291 needs, in base64url or base64', async () => {
    const b = await browser();
    expect(pushKeys(b.sub)).toEqual(b.sub);
    const padded = { p256dh: Buffer.from(b.raw).toString('base64'), auth: Buffer.from(b.secret).toString('base64') };
    expect(pushKeys(padded)).toEqual(b.sub);
    expect(pushKeys({ p256dh: b.sub.p256dh })).toBeNull();
    expect(pushKeys({ p256dh: b64url(b.raw.slice(1)), auth: b.sub.auth })).toBeNull();
    expect(pushKeys({ p256dh: b.sub.p256dh, auth: b64url(new Uint8Array(8)) })).toBeNull();
    expect(pushKeys('keys')).toBeNull();
  });
});

describe('sending', () => {
  afterEach(() => vi.unstubAllGlobals());

  async function setup(status: number | 'throw') {
    const v = await vapid();
    const { ctx } = fakeCtx({ VAPID_PUBLIC_KEY: v.keys.publicKey, VAPID_PRIVATE_KEY: v.keys.privateKey });
    const b = await browser();
    await ctx.db.savePushSub({ endpoint: 'https://fcm.googleapis.com/fcm/send/1', userId: 'ann', ...b.sub, now: 1 });
    const fetch = vi.fn(async () => {
      if (status === 'throw') throw new Error('no network');
      return new Response(null, { status });
    });
    vi.stubGlobal('fetch', fetch);
    return { ctx, fetch, b };
  }

  for (const status of [404, 410])
    it(`a ${status} from the push service forgets the subscription`, async () => {
      const { ctx, fetch } = await setup(status);
      expect(await pushTo(ctx, 'ann', { title: 't', body: 'b', url: null })).toBe(0);
      expect(fetch).toHaveBeenCalledOnce();
      expect(await ctx.db.pushSubs('ann')).toEqual([]);
    });

  for (const status of [500, 429, 'throw'] as const)
    it(`a failure (${status}) keeps it`, async () => {
      const { ctx } = await setup(status);
      expect(await pushTo(ctx, 'ann', { title: 't', body: 'b', url: null })).toBe(0);
      expect(await ctx.db.pushSubs('ann')).toHaveLength(1);
    });

  it('never posts to a stored endpoint that is no longer allowed', async () => {
    const { ctx, fetch, b } = await setup(201);
    await ctx.db.savePushSub({ endpoint: 'https://push.invalid/old', userId: 'ann', ...b.sub, now: 2 });
    expect(await pushTo(ctx, 'ann', { title: 't', body: 'b', url: null })).toBe(1);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('sends the encrypted message with the VAPID and encoding headers', async () => {
    const { ctx, fetch, b } = await setup(201);
    expect(await pushTo(ctx, 'ann', { title: 'Hi', body: 'There', url: '/x' })).toBe(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://fcm.googleapis.com/fcm/send/1');
    const headers = init.headers as Record<string, string>;
    expect(headers['content-encoding']).toBe('aes128gcm');
    expect(headers.authorization).toMatch(/^vapid t=.+, k=/);
    expect(JSON.parse((await decrypt(b, init.body as Uint8Array)).message)).toEqual({ title: 'Hi', body: 'There', url: '/x' });
  });
});
