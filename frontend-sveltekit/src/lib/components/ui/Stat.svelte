<!--
  One figure with what it counts (DaisyUI's stat), inside <Stats>. Numbers are shown in the
  person's language (1,204 or 1.204); `description` goes under ("21 more than last week").
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { formatNumber } from '#lib/i18n/index.svelte.ts';

  let {
    title,
    value,
    description,
    figure,
  }: {
    title: string;
    value: number | string;
    description?: string;
    /** Something at its end: an icon, an avatar. */
    figure?: Snippet;
  } = $props();
</script>

<div class="stat">
  {#if figure}<div class="stat-figure">{@render figure()}</div>{/if}
  <div class="stat-title">{title}</div>
  <div class="stat-value">{typeof value === 'number' ? formatNumber(value) : value}</div>
  {#if description}<div class="stat-desc">{description}</div>{/if}
</div>

<style>
  .stat-value {
    font-size: var(--text-2xl);
    font-weight: var(--weight-display);
    color: var(--color-heading);
  }

  .stat-title,
  .stat-desc {
    color: var(--color-muted);
  }
</style>
