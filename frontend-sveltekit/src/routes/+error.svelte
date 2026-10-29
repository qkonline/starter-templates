<!-- Any path that isn't a page (Pages serves the app shell as 404.html), or a page that failed. -->
<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { appName } from '#lib/config.ts';
</script>

<svelte:head
  ><title>{page.status === 404 ? 'Not found' : 'Something went wrong'} · {appName}</title></svelte:head
>

<main id="main" class="center stack">
  {#if page.status === 404}
    <h1>There’s nothing here</h1>
    <p class="muted">The address may be mistyped, or the page has moved.</p>
  {:else}
    <h1>Something went wrong</h1>
    <p class="muted">Reload the page to try again. If it keeps happening, let us know.</p>
  {/if}
  <p><a class="btn" href={resolve('')}>Go to the home page</a></p>
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
