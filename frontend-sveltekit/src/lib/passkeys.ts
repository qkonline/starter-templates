// Passkeys in the browser, with @simplewebauthn/browser. The backend's challenge options go to
// the browser's own prompt, and its answer goes back as JSON.

import {
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  startAuthentication,
  startRegistration,
  WebAuthnAbortService,
} from '@simplewebauthn/browser';
import { api, type Passkey, type SignIn } from '#lib/api/index.ts';
import { ApiError, cancelled } from '#lib/api/errors.ts';
import { t } from '#lib/i18n/index.svelte.ts';

type RegistrationOptions = Parameters<typeof startRegistration>[0]['optionsJSON'];
type AuthenticationOptions = Parameters<typeof startAuthentication>[0]['optionsJSON'];

export const passkeysSupported = (): boolean => typeof window !== 'undefined' && browserSupportsWebAuthn();

export { cancelled };

/** Plain words for what the browser threw. */
export function passkeyError(e: unknown): Error {
  if (e instanceof ApiError || cancelled(e)) return e as Error;
  const name = e instanceof Error ? e.name : '';
  const code = (e as { code?: string } | null)?.code ?? '';
  if (name === 'InvalidStateError' || code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED')
    return new Error(t('This device already has a passkey for your account.'));
  if (name === 'SecurityError')
    return new Error(t('Passkeys don’t work on this address. Open the app from its own site.'));
  return new Error(t('This browser couldn’t make or use a passkey.'));
}

/** Add a passkey on this device to the signed-in account. */
export async function addPasskey(): Promise<Passkey> {
  const { challengeId, options } = await api.addPasskeyStart();
  let response;
  try {
    response = await startRegistration({ optionsJSON: options as unknown as RegistrationOptions });
  } catch (e) {
    throw passkeyError(e);
  }
  return api.addPasskeyFinish(challengeId, response);
}

/**
 * Sign in with any passkey made for this site. With `autofill`, the browser offers passkeys in
 * the email field's suggestions instead of a prompt (the field needs `autocomplete="username webauthn"`).
 */
export async function signInWithPasskey(autofill = false): Promise<SignIn> {
  const { challengeId, options } = await api.passkeySignInStart();
  let response;
  try {
    response = await startAuthentication({
      optionsJSON: options as unknown as AuthenticationOptions,
      useBrowserAutofill: autofill,
    });
  } catch (e) {
    throw passkeyError(e);
  }
  return api.passkeySignInFinish(challengeId, response);
}

export async function autofillSupported(): Promise<boolean> {
  try {
    return passkeysSupported() && (await browserSupportsWebAuthnAutofill());
  } catch {
    return false;
  }
}

/** Stop a waiting autofill request, as when leaving the page. */
export const stopPasskeyAutofill = (): void => WebAuthnAbortService.cancelCeremony();
