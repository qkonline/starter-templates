<!-- A boxed message that stands out from the page: "You were signed out", "Confirm your email". -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  let { children, class: extra, ...rest }: HTMLAttributes<HTMLDivElement> & { children: Snippet } = $props();
</script>

<div {...rest} class={['notice', extra]}>{@render children()}</div>

<style>
  .notice {
    padding: var(--space-3) var(--space-4);
    color: var(--color-heading);
    font-size: var(--text-sm);
    background: var(--color-notice);
    border: var(--notice-border-width) solid var(--color-notice-border);
    border-radius: var(--radius);
  }

  /* Space below, unless last; a .stack or .row replaces it with its gap (src/app.css). */
  :where(.notice) {
    margin: 0 0 var(--flow-space);
  }

  :where(.notice:last-child) {
    margin-block-end: 0;
  }
</style>
