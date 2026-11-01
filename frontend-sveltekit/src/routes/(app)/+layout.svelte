<!--
  Everything behind sign-in. Without a working session, off to sign in. With
  `requireVerifiedEmail` on and the email unconfirmed, only the gate shows (PRD R1.7). The
  header shows Teams, Admin and the bell only when /features has them on. With sync on, it
  starts keeping the device's data in step and shows what's still waiting.
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { messageOf } from '#lib/api/index.ts';
  import { appName } from '#lib/config.ts';
  import { startSync } from '#lib/db/index.svelte.ts';
  import { auth, loadFeatures, loadMethods, loadUser } from '#lib/session.svelte.ts';
  import Avatar from '#lib/components/Avatar.svelte';
  import Bell from '#lib/components/Bell.svelte';
  import EmailGate from '#lib/components/EmailGate.svelte';
  import FeedbackDialog from '#lib/components/FeedbackDialog.svelte';
  import SyncRefused from '#lib/components/shell/SyncRefused.svelte';
  import SyncStatus from '#lib/components/shell/SyncStatus.svelte';
  import Spinner from '#lib/components/Spinner.svelte';
  import Button from '#lib/components/ui/Button.svelte';

  let { children } = $props();

  let phase = $state<'loading' | 'ready' | 'failed'>('loading');
  let problem = $state('');

  async function start() {
    phase = 'loading';
    try {
      const [, , user] = await Promise.all([loadMethods(), loadFeatures(), loadUser()]);
      if (!user) {
        const here = page.url.pathname + page.url.search;
        await goto(`${resolve('signin')}?next=${encodeURIComponent(here)}`, { replace: true });
        return;
      }
      phase = 'ready';
      // Not for an unconfirmed person when the app requires confirming: the backend refuses them.
      const held = !user.emailVerified && !!auth.methods?.requireVerifiedEmail;
      if (auth.features?.sync && !held) startSync();
    } catch (e) {
      problem = messageOf(e);
      phase = 'failed';
    }
  }

  start();

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
          <nav aria-label="Main">
            <a href={resolve('app')} aria-current={current(resolve('app'))}>Home</a>
            {#if teamsOn}
              <a href={resolve('teams')} aria-current={current(resolve('teams')) ?? current(resolve('team'))}
                >Teams</a
              >
            {/if}
            {#if adminOn}
              <a href={resolve('admin')} aria-current={within(resolve('admin'))}>Admin</a>
            {/if}
            {#if auth.features?.sync}<SyncStatus />{/if}
            <Bell />
            <a class="me" href={resolve('account')} aria-current={current(resolve('account'))}>
              <Avatar {user} size={28} />
              <span>Account</span>
            </a>
          </nav>
        </div>
      </header>

      {#if auth.features?.sync}<SyncRefused />{/if}

      {#if !user.emailVerified}
        <div class="banner" role="region" aria-label="Email not confirmed">
          <p>
            Confirm your email address, <strong>{user.email}</strong>, so you can always get back into your
            account.
            <a href="{resolve('account')}#email">Confirm it</a>
          </p>
        </div>
      {/if}

      <main id="main">
        {@render children()}
      </main>

      <footer class="foot muted small">
        <Button type="button" variant="link" onclick={() => feedback?.show()}>Send feedback</Button>
        <a href={resolve('contact')}>Contact</a>
        <a href={resolve('privacy')}>Privacy</a>
      </footer>
      <FeedbackDialog bind:this={feedback} />
    </div>
  {/if}
{:else if phase === 'failed'}
  <main id="main" class="center stack">
    <h1>Can’t reach the app</h1>
    <p role="alert">{problem}</p>
    <div><Button onclick={start}>Try again</Button></div>
  </main>
{:else}
  <div class="center" role="status"><Spinner /><span class="visually-hidden">Loading</span></div>
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
