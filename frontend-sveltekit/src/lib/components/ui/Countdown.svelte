<!--
  A number that rolls as it changes (DaisyUI's countdown), 0 to 999: seconds left, a live count.
  The page changes `value`; screen readers hear `label` (with the number in it), not each roll.

    <Countdown value={seconds} label={t('{n} seconds left', { n: seconds })} />
-->
<script lang="ts">
  let { value, label, digits = 2 }: { value: number; label: string; digits?: number } = $props();

  const shown = $derived(Math.max(0, Math.min(999, Math.round(value))));
</script>

<span class="countdown" role="timer" aria-label={label}>
  <span style:--value={shown} style:--digits={digits} aria-hidden="true">{shown}</span>
</span>

<style>
  .countdown {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
</style>
