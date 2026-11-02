<!--
  A small badge pinned to the corner of something (DaisyUI's indicator): unread counts on a
  bell, "new" on a card. `label` is what a screen reader hears for it ("3 unread").

    <Indicator value="3" label="3 unread"><Button>Inbox</Button></Indicator>
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    value,
    label,
    tone = 'primary',
    children,
  }: {
    /** What the badge shows; nothing for a dot. */
    value?: string;
    label: string;
    tone?: 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'error' | 'info' | 'neutral';
    children: Snippet;
  } = $props();

  // Written out in full: Tailwind builds only the class names it finds in the source.
  const tones = {
    primary: 'badge-primary',
    secondary: 'badge-secondary',
    accent: 'badge-accent',
    success: 'badge-success',
    warning: 'badge-warning',
    error: 'badge-error',
    info: 'badge-info',
    neutral: 'badge-neutral',
  };
</script>

<span class="indicator">
  <span class={['indicator-item badge badge-xs', tones[tone], { dot: !value }]}>
    <span aria-hidden="true">{value}</span><span class="visually-hidden">{label}</span>
  </span>
  {@render children()}
</span>

<style>
  .dot {
    width: 0.625rem;
    height: 0.625rem;
    padding: 0;
  }
</style>
