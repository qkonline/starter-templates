<!--
  The page the service worker shows for a page it hasn't kept, while offline (PRD R3.1).
  Prerendered, so it is cached at install.
-->
<script lang="ts">
  import { resolve } from '$app/paths';
  import { appName, homePath } from '#lib/config.ts';
</script>

<svelte:head>
  <title>You’re offline · {appName}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="stack offline">
  <h1>You’re offline</h1>
  <p class="muted">
    This page needs a connection. What you’ve already opened in {appName} still works; try this page again once
    you’re back online.
  </p>
  <div class="row">
    <a class="btn primary" href={resolve(homePath)} data-sveltekit-reload>Open {appName}</a>
    <button type="button" class="btn" onclick={() => location.reload()}>Try again</button>
  </div>
</div>

<style>
  .offline {
    max-width: 30rem;
    padding-block: var(--space-6);
  }
</style>
