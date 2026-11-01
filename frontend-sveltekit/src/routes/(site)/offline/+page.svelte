<!--
  The page the service worker shows for a page it hasn't kept, while offline (PRD R3.1).
  Prerendered, so it is cached at install.
-->
<script lang="ts">
  import { resolve } from '$app/paths';
  import { appName, homePath } from '#lib/config.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
  import Button from '#lib/components/ui/Button.svelte';
</script>

<svelte:head>
  <title>{t('You’re offline')} · {appName}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="stack offline">
  <h1>{t('You’re offline')}</h1>
  <p class="muted">
    {t(
      'This page needs a connection. What you’ve already opened in {app} still works; try this page again once you’re back online.',
      { app: appName },
    )}
  </p>
  <div class="row">
    <Button variant="primary" href={resolve(homePath)} data-sveltekit-reload
      >{t('Open {app}', { app: appName })}</Button
    >
    <Button type="button" onclick={() => location.reload()}>{t('Try again')}</Button>
  </div>
</div>

<style>
  .offline {
    max-width: 30rem;
    padding-block: var(--space-6);
  }
</style>
