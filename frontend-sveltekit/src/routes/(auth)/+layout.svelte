<!--
  The sign-in pages need /auth/methods before they can show anything: which ways of signing in
  are on, the CAPTCHA, the password settings. Someone already signed in goes straight on.
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { messageOf } from '#lib/api/index.ts';
  import { homePath } from '#lib/config.ts';
  import { safeNext } from '#lib/format.ts';
  import { hasToken, loadMethods, loadUser } from '#lib/session.svelte.ts';
  import AuthShell from '#lib/components/AuthShell.svelte';
  import Spinner from '#lib/components/Spinner.svelte';
  import Button from '#lib/components/ui/Button.svelte';
  import { t } from '#lib/i18n/index.svelte.ts';

  let { children } = $props();

  let phase = $state<'loading' | 'ready' | 'failed'>('loading');
  let problem = $state('');

  async function start() {
    phase = 'loading';
    try {
      // Already signed in on this device: no need to sign in again.
      if (hasToken() && page.route.id !== '/(auth)/auth/callback' && (await loadUser())) {
        await goto(safeNext(page.url.searchParams.get('next')) ?? resolve(homePath), { replace: true });
        return;
      }
      await loadMethods();
      phase = 'ready';
    } catch (e) {
      problem = messageOf(e);
      phase = 'failed';
    }
  }

  start();
</script>

{#if phase === 'ready'}
  {@render children()}
{:else if phase === 'failed'}
  <AuthShell title={t('Can’t reach the app')}>
    <p role="alert">{problem}</p>
    <div><Button onclick={start}>{t('Try again')}</Button></div>
  </AuthShell>
{:else}
  <div class="loading" role="status"><Spinner /><span class="visually-hidden">{t('Loading')}</span></div>
{/if}

<style>
  .loading {
    min-height: 60dvh;
    display: grid;
    place-items: center;
    color: var(--color-muted);
  }
</style>
