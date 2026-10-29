<!-- The landing page: replace with the app's own. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { appName } from '#lib/config.ts';

  // A backend that can't tell where a social sign-in started sends the browser to the site's
  // root with `error=oauth_…` (contract: /auth/oauth/{provider}/callback); show it there.
  onMount(() => {
    const error = new URLSearchParams(location.search).get('error');
    if (error?.startsWith('oauth_'))
      goto(`${resolve('auth/callback')}?error=${encodeURIComponent(error)}`, { replace: true });
  });
</script>

<svelte:head>
  <title>{appName}</title>
  <meta name="description" content="{appName}: a short line about what the app does." />
</svelte:head>

<section class="hero">
  <p class="eyebrow muted">Placeholder landing page</p>
  <h1>Say what {appName} does, in one line.</h1>
  <p class="lead muted">
    A sentence or two on who it’s for and why it helps. This page is built ahead of time, so it loads fast and
    search engines can read it.
  </p>
  <div class="row">
    <a class="btn primary" href={resolve('signup')}>Create an account</a>
    <a class="btn" href={resolve('signin')}>Sign in</a>
  </div>
</section>

<style>
  .hero {
    max-width: 38rem;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding-top: var(--space-7);
  }

  .hero h1 {
    font-size: clamp(2rem, 6vw, 3rem);
  }

  .eyebrow {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .lead {
    font-size: var(--text-lg);
  }
</style>
