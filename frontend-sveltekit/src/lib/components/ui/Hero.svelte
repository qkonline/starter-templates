<!--
  The big opening block of a public page (DaisyUI's hero): a heading, a line under it, then
  whatever follows (buttons).

    <Hero title="Plan the day you actually have" lead="…"><Button variant="primary" …>Start</Button></Hero>
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title, lead, children }: { title: string; lead?: string; children?: Snippet } = $props();
</script>

<section class="hero flow">
  <div class="hero-content text-center">
    <div class="inner">
      <h1>{title}</h1>
      {#if lead}<p class="lead">{lead}</p>{/if}
      {#if children}<div class="row actions">{@render children()}</div>{/if}
    </div>
  </div>
</section>

<style>
  .hero {
    padding-block: var(--space-7);
  }

  .inner {
    max-width: 36rem;
  }

  h1 {
    font-size: clamp(var(--text-2xl), 5vw, 2.5rem);
  }

  .lead {
    margin-top: var(--space-3);
    font-size: var(--text-lg);
    color: var(--color-muted);
  }

  .actions {
    justify-content: center;
    margin-top: var(--space-5);
  }
</style>
