<!--
  An on/off switch with its words beside it (DaisyUI's toggle): a checkbox a screen reader hears
  as a switch. Anything else (name, disabled, onchange…) goes straight to the <input>.

    <Toggle bind:checked={weekly} label="Weekly summary" hint="Every Monday morning." />
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLInputAttributes } from 'svelte/elements';

  type Tone = 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'error';

  let {
    checked = $bindable(false),
    label,
    hint,
    tone = 'primary',
    size = 'md',
    class: extra,
    ...rest
  }: Omit<HTMLInputAttributes, 'type' | 'size'> & {
    checked?: boolean;
    label: string | Snippet;
    hint?: string;
    tone?: Tone;
    size?: 'xs' | 'sm' | 'md' | 'lg';
  } = $props();

  const uid = $props.id();

  // Written out in full: Tailwind builds only the class names it finds in the source.
  const tones = {
    primary: 'toggle-primary',
    secondary: 'toggle-secondary',
    accent: 'toggle-accent',
    success: 'toggle-success',
    warning: 'toggle-warning',
    error: 'toggle-error',
  };
  const sizes = { xs: 'toggle-xs', sm: 'toggle-sm', md: '', lg: 'toggle-lg' };
</script>

<div class={['choice flow', extra]}>
  <input
    id="{uid}-input"
    type="checkbox"
    role="switch"
    bind:checked
    aria-describedby={hint ? `${uid}-hint` : undefined}
    {...rest}
    class={['toggle', tones[tone], sizes[size]]}
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
    gap: var(--space-3);
  }

  .toggle {
    flex: none;
    margin-top: 0.1em;
  }

  label {
    cursor: pointer;
  }
</style>
