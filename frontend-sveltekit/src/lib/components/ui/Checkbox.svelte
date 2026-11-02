<!--
  A box to tick, with its words beside it (DaisyUI's checkbox). Anything else (name, required,
  disabled, onchange…) goes straight to the <input>.

    <Checkbox bind:checked={terms} label="I agree to the terms" />
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLInputAttributes } from 'svelte/elements';

  type Tone = 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'error';

  let {
    checked = $bindable(false),
    indeterminate = $bindable(false),
    label,
    hint,
    tone = 'primary',
    size = 'md',
    class: extra,
    ...rest
  }: Omit<HTMLInputAttributes, 'type' | 'size'> & {
    checked?: boolean;
    /** Neither ticked nor not (some of a group). */
    indeterminate?: boolean;
    label: string | Snippet;
    hint?: string;
    tone?: Tone;
    size?: 'xs' | 'sm' | 'md' | 'lg';
  } = $props();

  const uid = $props.id();

  // Written out in full: Tailwind builds only the class names it finds in the source.
  const tones = {
    primary: 'checkbox-primary',
    secondary: 'checkbox-secondary',
    accent: 'checkbox-accent',
    success: 'checkbox-success',
    warning: 'checkbox-warning',
    error: 'checkbox-error',
  };
  const sizes = { xs: 'checkbox-xs', sm: 'checkbox-sm', md: '', lg: 'checkbox-lg' };
</script>

<div class={['choice flow', extra]}>
  <input
    id="{uid}-input"
    type="checkbox"
    bind:checked
    bind:indeterminate
    aria-describedby={hint ? `${uid}-hint` : undefined}
    {...rest}
    class={['checkbox', tones[tone], sizes[size]]}
  />
  <div class="words">
    <label for="{uid}-input"
      >{#if typeof label === 'string'}{label}{:else}{@render label()}{/if}</label
    >
    {#if hint}<p class="hint" id="{uid}-hint">{hint}</p>{/if}
  </div>
</div>

<style>
  .choice {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
  }

  .checkbox {
    flex: none;
    margin-top: 0.1em;
  }

  label {
    cursor: pointer;
  }
</style>
