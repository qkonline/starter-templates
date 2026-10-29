<!-- The frame for the sign-in pages: a narrow column, the app's name, a heading. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { resolve } from '$app/paths';
  import { appName } from '#lib/config.ts';

  let { title, lead, children }: { title: string; lead?: string; children: Snippet } = $props();
</script>

<svelte:head><title>{title} · {appName}</title></svelte:head>

<div class="shell">
  <a class="brand" href={resolve('')}>{appName}</a>
  <main id="main" class="column">
    <header>
      <h1>{title}</h1>
      {#if lead}<p class="muted">{lead}</p>{/if}
    </header>
    {@render children()}
  </main>
</div>

<style>
  .shell {
    min-height: 100dvh;
    padding: var(--space-5) var(--space-4) var(--space-7);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-7);
  }

  .brand {
    align-self: stretch;
    max-width: var(--page-width);
    width: 100%;
    margin: 0 auto;
    font-weight: 650;
    letter-spacing: var(--tracking-tight);
    color: var(--color-text);
    text-decoration: none;
  }

  .column {
    width: 100%;
    max-width: var(--form-width);
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  header {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  @media (min-width: 40rem) {
    .shell {
      gap: var(--space-8);
    }
  }
</style>
