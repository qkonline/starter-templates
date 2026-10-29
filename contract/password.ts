// The one way a password becomes the `passwordKey` a backend sees. The slow part (600,000 rounds
// of PBKDF2) runs here, on the person's device, so a backend with a few milliseconds of CPU per
// request never has to. Frontends and the contract tests both import this; a backend never does.
// Plain Web Crypto, so it runs the same in every browser, Node and Workers.

export interface PasswordSettings {
  /** The app's own name, from `/auth/methods`. */
  saltPrefix: string;
  /** From `/auth/methods`: 600,000. */
  iterations: number;
}

const b64url = (bytes: ArrayBuffer): string => {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** The email as backends keep it: trimmed and lower-cased. */
export const cleanEmail = (email: string): string => email.trim().toLowerCase();

/** 32 bytes of PBKDF2-HMAC-SHA-256, base64url without padding (43 characters). */
export async function passwordKey(password: string, email: string, settings: PasswordSettings): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: enc.encode(`${settings.saltPrefix}|${cleanEmail(email)}`),
      iterations: settings.iterations,
    },
    key,
    256,
  );
  return b64url(bits);
}
