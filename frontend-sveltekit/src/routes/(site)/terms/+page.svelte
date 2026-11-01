<script lang="ts">
  import { appName } from '#lib/config.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
</script>

<svelte:head><title>{t('Terms')} · {appName}</title></svelte:head>

<article class="prose">
  <h1>{t('Terms')}</h1>
  <p class="muted">{t('Placeholder: replace with the app’s terms of use before launch.')}</p>
</article>

<style>
  .prose {
    max-width: 38rem;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
</style>
