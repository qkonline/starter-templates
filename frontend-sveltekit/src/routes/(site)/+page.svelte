<!-- The landing page: replace with the app's own. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { appName } from '#lib/config.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
  import Button from '#lib/components/ui/Button.svelte';

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
  <meta name="description" content={t('{app}: a short line about what the app does.', { app: appName })} />
</svelte:head>

<section class="hero">
  <h1>{t('Say what {app} does, in one line.', { app: appName })}</h1>
  <p class="lead muted">
    {t(
      'A sentence or two on who it’s for and why it helps. This placeholder is built ahead of time, so it loads fast and search engines can read it.',
    )}
  </p>
  <div class="row">
    <Button variant="primary" href={resolve('signup')}>{t('Create an account')}</Button>
    <Button href={resolve('signin')}>{t('Sign in')}</Button>
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
    letter-spacing: -0.02em;
  }

  .lead {
    font-size: var(--text-lg);
  }
</style>
