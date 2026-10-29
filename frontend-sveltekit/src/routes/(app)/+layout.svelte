<!--
  Everything behind sign-in. Without a working session, off to sign in. With
  `requireVerifiedEmail` on and the email unconfirmed, only the gate shows (PRD R1.7). The
  header shows Teams, Admin and the bell only when /features has them on.
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { messageOf } from '#lib/api/index.ts';
  import { appName } from '#lib/config.ts';
  import { auth, loadFeatures, loadMethods, loadUser } from '#lib/session.svelte.ts';
  import Avatar from '#lib/components/Avatar.svelte';
  import Bell from '#lib/components/Bell.svelte';
  import EmailGate from '#lib/components/EmailGate.svelte';
  import FeedbackDialog from '#lib/components/FeedbackDialog.svelte';
  import Spinner from '#lib/components/Spinner.svelte';

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
        <a class="brand" href={resolve('app')}>{appName}</a>
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
          <Bell />
          <a class="me" href={resolve('account')} aria-current={current(resolve('account'))}>
            <Avatar {user} size={28} />
            <span>Account</span>
          </a>
        </nav>
      </header>

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
        <button type="button" class="btn link" onclick={() => feedback?.show()}>Send feedback</button>
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
    <div><button class="btn" onclick={start}>Try again</button></div>
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

  .bar {
    width: 100%;
    max-width: var(--page-width);
    margin: 0 auto;
    padding: var(--space-3) var(--space-4);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .brand {
    font-weight: 650;
    letter-spacing: var(--tracking-tight);
    color: var(--color-text);
    text-decoration: none;
  }

  nav {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  nav a {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--control-height);
    padding: 0 var(--space-3);
    color: var(--color-muted);
    text-decoration: none;
    border-radius: var(--radius-sm);
  }

  nav a:hover {
    color: var(--color-text);
    background: var(--color-sunken);
  }

  nav a[aria-current='page'] {
    color: var(--color-text);
    font-weight: 560;
  }

  .banner {
    background: var(--color-notice);
    border-block: 1px solid var(--color-notice-border);
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
    max-width: var(--page-width);
    margin: 0 auto;
    padding: var(--space-6) var(--space-4) var(--space-8);
  }

  .foot {
    width: 100%;
    max-width: var(--page-width);
    margin: 0 auto;
    padding: var(--space-4);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-5);
    border-top: 1px solid var(--color-border);
  }

  .foot a,
  .foot .btn.link {
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

    .bar {
      padding-inline: var(--space-3);
    }

    nav a {
      padding: 0 var(--space-2);
    }
  }
</style>
