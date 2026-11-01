<!-- The frame for the sign-in pages: the app's mark, then one centred panel with a heading. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { resolve } from '$app/paths';
  import { appName } from '#lib/config.ts';

  let { title, lead, children }: { title: string; lead?: string; children: Snippet } = $props();
</script>

<svelte:head><title>{title} · {appName}</title></svelte:head>

<div class="shell">
  <a class="brand" href={resolve('')}><span class="logo" aria-hidden="true"></span>{appName}</a>
  <main id="main" class="card stack">
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
    padding: var(--space-7) var(--space-4);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-5);
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-lg);
    font-weight: var(--weight-heading);
    color: var(--color-heading);
    text-decoration: none;
  }

  .logo {
    width: 1.5rem;
    height: 1.5rem;
    border-radius: var(--radius-sm);
    background: var(--color-accent);
  }

  .card {
    width: 100%;
    max-width: 26rem;
    gap: var(--space-5);
    padding: var(--space-6);
    background: var(--panel-bg);
    border: 1px solid var(--panel-border);
    border-radius: var(--panel-radius);
    box-shadow: var(--panel-shadow);
  }

  header {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  h1 {
    font-size: var(--text-xl);
  }

  @media (max-width: 30rem) {
    .shell {
      padding-top: var(--space-5);
    }

    .card {
      padding: var(--space-5) var(--space-4);
    }
  }
</style>
