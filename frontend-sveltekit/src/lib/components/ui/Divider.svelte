<!-- A rule with a word in it, between two ways of doing one thing: "or". -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

<div class="divider">{@render children()}</div>

<style>
  .divider {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    color: var(--color-muted);
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    border-top: 1px solid var(--color-border);
  }

  /* Space below, unless last; a .stack or .row replaces it with its gap (src/app.css). */
  :where(.divider) {
    margin: 0 0 var(--flow-space);
  }

  :where(.divider:last-child) {
    margin-block-end: 0;
  }
</style>
