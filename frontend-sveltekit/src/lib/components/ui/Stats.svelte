<!--
  Figures side by side in one box (DaisyUI's stats), each a <Stat>; one under another on a
  narrow screen.

    <Stats><Stat title="People" value={1204} /><Stat title="Teams" value={87} /></Stats>
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { vertical = false, children }: { vertical?: boolean; children: Snippet } = $props();
</script>

<div class={['stats flow', vertical ? 'stats-vertical' : 'stats-vertical sm:stats-horizontal']}>
  {@render children()}
</div>

<style>
  .stats {
    width: 100%;
    background: var(--color-base-100);
    border: var(--border) solid var(--color-base-300);
    border-radius: var(--radius-box);
  }
</style>
