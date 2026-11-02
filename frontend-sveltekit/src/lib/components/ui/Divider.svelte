<!-- A rule with a word in it, between two ways of doing one thing: "or" (DaisyUI's divider). -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children }: { children?: Snippet } = $props();
</script>

<div class="divider">{@render children?.()}</div>

<style>
  /* Space below, unless last; a .stack or .row replaces it with its gap (src/app.css). */
  :where(.divider) {
    margin: 0 0 var(--flow-space);
  }

  :where(.divider:last-child) {
    margin-block-end: 0;
  }
</style>
