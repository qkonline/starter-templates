<!--
  A bar across the top with things at its start, middle and end (DaisyUI's navbar): a page's
  own header, a toolbar over a table.

    <Navbar>{#snippet start()}…{/snippet}{#snippet end()}…{/snippet}</Navbar>
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { start, center, end }: { start?: Snippet; center?: Snippet; end?: Snippet } = $props();
</script>

<div class="navbar flow">
  <div class="navbar-start">{@render start?.()}</div>
  {#if center}<div class="navbar-center">{@render center()}</div>{/if}
  <div class="navbar-end">{@render end?.()}</div>
</div>

<style>
  .navbar {
    gap: var(--space-2);
    background: var(--color-base-100);
    border: var(--border) solid var(--color-base-300);
    border-radius: var(--radius-box);
  }

  .navbar-start,
  .navbar-end {
    gap: var(--space-2);
  }
</style>
