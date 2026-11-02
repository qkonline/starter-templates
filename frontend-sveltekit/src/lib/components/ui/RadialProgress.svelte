<!--
  A share as a ring with the number in it (DaisyUI's radial progress): storage used, a score.

    <RadialProgress label="Storage used" value={72} />
-->
<script lang="ts">
  import { formatNumber } from '#lib/i18n/index.svelte.ts';

  let {
    label,
    value,
    size = '4rem',
    tone = 'primary',
  }: {
    label: string;
    /** 0 to 100. */
    value: number;
    size?: string;
    tone?: 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'error' | 'info';
  } = $props();

  // Written out in full: Tailwind builds only the class names it finds in the source.
  const tones = {
    primary: 'text-primary',
    secondary: 'text-secondary',
    accent: 'text-accent',
    success: 'text-success',
    warning: 'text-warning',
    error: 'text-error',
    info: 'text-info',
  };
  const shown = $derived(Math.max(0, Math.min(100, Math.round(value))));
</script>

<div
  class={['radial-progress', tones[tone]]}
  style:--value={shown}
  style:--size={size}
  role="progressbar"
  aria-label={label}
  aria-valuenow={shown}
  aria-valuemin={0}
  aria-valuemax={100}
>
  <span class="number">{formatNumber(shown)}%</span>
</div>

<style>
  .number {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--color-heading);
  }
</style>
