<!--
  Everything behind sign-in. Without a working session, off to sign in. With
  `requireVerifiedEmail` on and the email unconfirmed, only the gate shows (PRD R1.7). The
  header shows Teams, Admin and the bell only when /features has them on. With sync on, it
  starts keeping the device's data in step and shows what's still waiting.

  Offline first: when the device kept what the app needs from the last start, the app opens from
  it at once and checks with the backend in the background (and again on reconnecting), so it
  opens with no connection, or with the backend down. Only a first start needs the network.
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { messageOf } from '#lib/api/index.ts';
  import { appNav } from '#lib/app/shell.ts';
  import { appName } from '#lib/config.ts';
  import { onMount } from 'svelte';
  import { startSync, useAccount } from '#lib/db/index.svelte.ts';
  import type { User } from '#lib/api/index.ts';
  import { auth, loadFeatures, loadMethods, loadUser, startFromDevice } from '#lib/session.svelte.ts';
  import Avatar from '#lib/components/Avatar.svelte';
  import Bell from '#lib/components/Bell.svelte';
  import EmailGate from '#lib/components/EmailGate.svelte';
  import FeedbackDialog from '#lib/components/FeedbackDialog.svelte';
  import SyncRefused from '#lib/components/shell/SyncRefused.svelte';
  import SyncStatus from '#lib/components/shell/SyncStatus.svelte';
  import Spinner from '#lib/components/Spinner.svelte';
  import Button from '#lib/components/ui/Button.svelte';
  import Trans from '#lib/components/Trans.svelte';
  import { msg, t } from '#lib/i18n/index.svelte.ts';

  let { children } = $props();

  let phase = $state<'loading' | 'ready' | 'failed'>('loading');
  let problem = $state('');

  /** Asks the backend; null when the session no longer works (then off to sign in). */
  async function check(): Promise<User | null> {
    const [, , user] = await Promise.all([loadMethods(), loadFeatures(), loadUser()]);
    if (!user) {
      const here = page.url.pathname + page.url.search;
      await goto(`${resolve('signin')}?next=${encodeURIComponent(here)}`, { replace: true });
    }
    return user;
  }

  async function enter(user: User) {
    await useAccount(user.id, !!auth.support);
    phase = 'ready';
    // Not for an unconfirmed person when the app requires confirming: the backend refuses them.
    const held = !user.emailVerified && !!auth.methods?.requireVerifiedEmail;
    if (auth.features?.sync && !held) startSync();
  }

  async function start() {
    phase = 'loading';
    if (startFromDevice()) {
      await enter(auth.user!);
      void recheck();
      return;
    }
    try {
      const user = await check();
      if (user) await enter(user);
    } catch (e) {
      problem = messageOf(e);
      phase = 'failed';
    }
  }

  /** In the background: what the backend says now (a switch turned on, the name changed). */
  async function recheck() {
    try {
      const user = await check();
      if (user) await enter(user);
    } catch {
      /* No answer: the device's copies stand until the next try. */
    }
  }

  start();

  onMount(() => {
    const online = () => void recheck();
    addEventListener('online', online);
    return () => removeEventListener('online', online);
  });

  const user = $derived(auth.user);
  const gated = $derived(!!user && !user.emailVerified && !!auth.methods?.requireVerifiedEmail);
  const current = (path: string) => (page.url.pathname === path ? 'page' : undefined);
  const within = (path: string) =>
    page.url.pathname === path || page.url.pathname.startsWith(`${path}/`) ? 'page' : undefined;
  const teamsOn = $derived(!!auth.features?.teams);
  const adminOn = $derived(!!auth.features?.admin && !!user?.isAdmin && !auth.support);
  let feedback = $state<ReturnType<typeof FeedbackDialog>>();
</script>

{#if phase === 'ready' && user}
  {#if gated}
    <EmailGate />
  {:else}
    <div class="app">
      <header class="bar">
        <div class="bar-in">
          <a class="brand" href={resolve('app')}><span class="logo" aria-hidden="true"></span>{appName}</a>
          <nav aria-label={t('Main')}>
            <a href={resolve('app')} aria-current={current(resolve('app'))}>{t('Home')}</a>
            {#each appNav as item (item.path)}
              {@const href = `${resolve('')}${item.path}`.replace(/\/\/+/g, '/')}
              <a {href} aria-current={item.match === 'prefix' ? within(href) : current(href)}
                >{t(item.label)}</a
              >
            {/each}
            {#if teamsOn}
              <a href={resolve('teams')} aria-current={current(resolve('teams')) ?? current(resolve('team'))}
                >{t('Teams')}</a
              >
            {/if}
            {#if adminOn}
              <a href={resolve('admin')} aria-current={within(resolve('admin'))}>{t('Admin')}</a>
            {/if}
            {#if auth.features?.sync}<SyncStatus />{/if}
            <Bell />
            <a class="me" href={resolve('account')} aria-current={current(resolve('account'))}>
              <Avatar {user} size={28} />
              <span>{t('Account')}</span>
            </a>
          </nav>
        </div>
      </header>

      {#if auth.features?.sync}<SyncRefused />{/if}

      {#if !user.emailVerified}
        <div class="banner" role="region" aria-label={t('Email not confirmed')}>
          <p>
            <Trans
              text={msg(
                'Confirm your email address, <b>{email}</b>, so you can always get back into your account.',
              )}
              vars={{ email: user.email }}
            >
              {#snippet b(s: string)}<strong>{s}</strong>{/snippet}
            </Trans>
            <a href="{resolve('account')}#email">{t('Confirm it')}</a>
          </p>
        </div>
      {/if}

      <main id="main">
        {@render children()}
      </main>

      <footer class="foot muted small">
        <Button type="button" variant="link" onclick={() => feedback?.show()}>{t('Send feedback')}</Button>
        <a href={resolve('contact')}>{t('Contact')}</a>
        <a href={resolve('privacy')}>{t('Privacy')}</a>
      </footer>
      <FeedbackDialog bind:this={feedback} />
    </div>
  {/if}
{:else if phase === 'failed'}
  <main id="main" class="center stack">
    <h1>{t('Can’t reach the app')}</h1>
    <p role="alert">{problem}</p>
    <div><Button onclick={start}>{t('Try again')}</Button></div>
  </main>
{:else}
  <div class="center" role="status"><Spinner /><span class="visually-hidden">{t('Loading')}</span></div>
{/if}

<style>
  .app {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
  }

  /* The top bar: full width, the theme's height, shadow and hairline. */
  .bar {
    position: sticky;
    top: 0;
    z-index: 20;
    background: var(--header-bg);
    border-bottom: 1px solid var(--header-border);
    box-shadow: var(--header-shadow);
  }

  .bar-in {
    max-width: calc(var(--page-width) + 2 * var(--space-4));
    margin: 0 auto;
    min-height: var(--header-height);
    padding: 0 var(--space-4);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-weight: var(--weight-heading);
    color: var(--color-heading);
    text-decoration: none;
  }

  /* A placeholder mark in the brand colour; an app replaces it with its own. */
  .logo {
    width: 1.25rem;
    height: 1.25rem;
    border-radius: var(--radius-sm);
    background: var(--color-accent);
  }

  nav {
    display: flex;
    align-items: stretch;
    align-self: stretch;
    gap: var(--space-1);
  }

  nav a {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-3);
    color: var(--color-text);
    font-size: var(--text-sm);
    text-decoration: none;
    box-shadow: inset 0 -2px 0 transparent;
    transition:
      color 160ms cubic-bezier(0.2, 0, 0, 1),
      box-shadow 160ms cubic-bezier(0.2, 0, 0, 1);
  }

  nav a:hover {
    color: var(--color-link);
  }

  nav a[aria-current='page'] {
    color: var(--color-link);
    box-shadow: inset 0 -2px 0 var(--color-accent);
  }

  nav :global(.bell) {
    align-self: center;
  }

  .banner {
    color: var(--color-heading);
    background: var(--color-notice);
    border-bottom: 1px solid var(--color-notice-border);
  }

  .banner p {
    max-width: var(--page-width);
    margin: 0 auto;
    padding: var(--space-3) var(--space-4);
    font-size: var(--text-sm);
  }

  main {
    flex: 1;
    width: 100%;
    max-width: calc(var(--page-width) + 2 * var(--space-4));
    margin: 0 auto;
    padding: var(--space-6) var(--space-4) var(--space-8);
  }

  .foot {
    width: 100%;
    max-width: calc(var(--page-width) + 2 * var(--space-4));
    margin: 0 auto;
    padding: var(--space-4);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-5);
    border-top: 1px solid var(--color-border);
  }

  .foot a,
  .foot :global(.btn) {
    color: inherit;
    font-size: inherit;
  }

  .center {
    min-height: 60dvh;
    display: grid;
    place-content: center;
    gap: var(--space-4);
    padding: var(--space-4);
    color: var(--color-muted);
  }

  @media (max-width: 30rem) {
    .me span {
      display: none;
    }

    .bar-in {
      padding-inline: var(--space-3);
    }

    nav a {
      padding: 0 var(--space-2);
    }
  }
</style>
