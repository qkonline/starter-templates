<!--
  Back from Google (PRD R1.9): the backend sends the browser here with a one-time `code`, traded
  for a session, or an `error`, shown in plain words. The code is traded only when `n` is the
  nonce this tab set before leaving (#lib/oauth.ts), so a sign-in started anywhere else, such as
  a link someone sent, never signs this browser in.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { api, messageOf } from '#lib/api/index.ts';
  import { takeOAuthNonce } from '#lib/oauth.ts';
  import { signedIn } from '#lib/session.svelte.ts';
  import { msg, t } from '#lib/i18n/index.svelte.ts';
  import AuthShell from '#lib/components/AuthShell.svelte';
  import Spinner from '#lib/components/Spinner.svelte';
  import Button from '#lib/components/ui/Button.svelte';

  const words: Record<string, string> = {
    oauth_denied: msg('Signing in was cancelled.'),
    oauth_no_email: msg(
      'Google didn’t share a confirmed email address, so we couldn’t sign you in. Try another way.',
    ),
    oauth_failed: msg('Signing in with Google didn’t work. Try again.'),
    not_started_here: msg(
      'This sign-in wasn’t started from this tab, so it was stopped. To sign in with Google, start from the sign-in page.',
    ),
    account_suspended: msg(
      'This account is suspended, so it can’t sign in. If you think that’s a mistake, contact us.',
    ),
  };

  let problem = $state('');

  function takeNext(): string | null {
    try {
      const next = sessionStorage.getItem('starter:next');
      sessionStorage.removeItem('starter:next');
      return next;
    } catch {
      return null;
    }
  }

  onMount(async () => {
    const params = page.url.searchParams;
    const error = params.get('error');
    const code = params.get('code');
    // Checked whatever came back, so the nonce never works twice.
    const startedHere = takeOAuthNonce(params.get('n'));
    // Out of the address bar and history either way: the code works once.
    await goto(page.url.pathname, { shallow: true, replace: true });
    if (error || !code) {
      problem = t((error && words[error]) || words.oauth_failed!);
      return;
    }
    if (!startedHere) {
      problem = t(words.not_started_here!);
      return;
    }
    try {
      await signedIn(await api.oauthExchange(code), takeNext());
    } catch (e) {
      problem = messageOf(e);
    }
  });
</script>

{#if problem}
  <AuthShell title={t('Couldn’t sign you in')}>
    <p role="alert">{problem}</p>
    <div><Button variant="primary" href={resolve('signin')}>{t('Back to sign in')}</Button></div>
  </AuthShell>
{:else}
  <AuthShell title={t('Signing you in…')}>
    <p class="row muted" role="status"><Spinner /> {t('One moment.')}</p>
  </AuthShell>
{/if}
