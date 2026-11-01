<!-- Any path that isn't a page (Pages serves the app shell as 404.html), or a page that failed. -->
<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { appName } from '#lib/config.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
  import Button from '#lib/components/ui/Button.svelte';
</script>

<svelte:head
  ><title>{page.status === 404 ? t('Not found') : t('Something went wrong')} · {appName}</title></svelte:head
>

<main id="main" class="center stack">
  {#if page.status === 404}
    <h1>{t('There’s nothing here')}</h1>
    <p class="muted">{t('The address may be mistyped, or the page has moved.')}</p>
  {:else}
    <h1>{t('Something went wrong')}</h1>
    <p class="muted">{t('Reload the page to try again. If it keeps happening, let us know.')}</p>
  {/if}
  <p><Button href={resolve('')}>{t('Go to the home page')}</Button></p>
</main>

<style>
  .center {
    min-height: 70dvh;
    display: grid;
    place-content: center;
    padding: var(--space-4);
    text-align: center;
  }
</style>
