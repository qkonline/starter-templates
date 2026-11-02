<!--
  One choice out of a list, one under another (DaisyUI's radio): for choices with longer words
  than <Segmented> fits, or a hint each.

    <RadioGroup legend="Plan" options={plans} bind:value={plan} />
-->
<script lang="ts" generics="T extends string">
  const uid = $props.id();

  let {
    legend,
    options,
    value = $bindable(),
    name = uid,
    hideLegend = false,
    tone = 'primary',
    onchange,
  }: {
    legend: string;
    options: readonly { value: T; label: string; hint?: string; disabled?: boolean }[];
    /** Nothing chosen yet when undefined. */
    value: T | undefined;
    name?: string;
    hideLegend?: boolean;
    tone?: 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'error';
    onchange?: (value: T) => void;
  } = $props();

  // Written out in full: Tailwind builds only the class names it finds in the source.
  const tones = {
    primary: 'radio-primary',
    secondary: 'radio-secondary',
    accent: 'radio-accent',
    success: 'radio-success',
    warning: 'radio-warning',
    error: 'radio-error',
  };
</script>

<fieldset class="fieldset radios flow">
  <legend class={hideLegend ? 'visually-hidden' : 'fieldset-legend'}>{legend}</legend>
  {#each options as o (o.value)}
    <label class="option">
      <input
        type="radio"
        class={['radio', tones[tone]]}
        {name}
        value={o.value}
        checked={value === o.value}
        disabled={o.disabled}
        aria-describedby={o.hint ? `${uid}-${o.value}` : undefined}
        onchange={() => {
          value = o.value;
          onchange?.(o.value);
        }}
      />
      <span>
        <span class="text">{o.label}</span>
        {#if o.hint}<span class="hint" id="{uid}-{o.value}">{o.hint}</span>{/if}
      </span>
    </label>
  {/each}
</fieldset>

<style>
  .radios {
    padding: 0;
    gap: var(--space-2);
  }

  .fieldset-legend {
    padding-block: 0 var(--space-1);
  }

  .option {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    cursor: pointer;
    font-size: var(--text-md);
  }

  .radio {
    margin-top: 0.15em;
  }

  .text,
  .hint {
    display: block;
  }
</style>
