<!--
  A drop-down list; like <Input>, it takes its id and descriptions from a <Field>. `small` fits
  it into a row (a member's role in a list) instead of filling the form's width.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLSelectAttributes } from 'svelte/elements';
  import { getField } from './field.ts';

  let {
    value = $bindable(),
    ref = $bindable(),
    small = false,
    class: extra,
    children,
    ...rest
  }: Omit<HTMLSelectAttributes, 'value'> & {
    value?: string;
    ref?: HTMLSelectElement;
    small?: boolean;
    children: Snippet;
  } = $props();

  const field = getField();
</script>

<span class={['select', { small }]}>
  <select
    bind:this={ref}
    bind:value
    id={field?.id}
    aria-describedby={field?.describedby}
    aria-invalid={field?.invalid || undefined}
    {...rest}
    class={['input', { small }, extra]}
  >
    {@render children()}
  </select>
</span>

<style>
  /* Drawn by the theme rather than the browser: the control height, and a chevron drawn in the
     muted text colour, so it follows the theme and the mode. */
  .select {
    position: relative;
    display: block;
  }

  .select.small {
    display: inline-block;
    align-self: flex-start;
    width: fit-content;
  }

  .select::after {
    content: '';
    position: absolute;
    right: calc(var(--control-padding-x) + 2px);
    top: 50%;
    width: 0.4rem;
    height: 0.4rem;
    border-right: 1.5px solid var(--color-muted);
    border-bottom: 1.5px solid var(--color-muted);
    transform: translateY(-70%) rotate(45deg);
    pointer-events: none;
  }

  .input {
    appearance: none;
    width: 100%;
    height: var(--control-height);
    min-height: var(--control-height);
    padding: 0 calc(var(--control-padding-x) + 1.25rem) 0 var(--control-padding-x);
    font: inherit;
    font-size: var(--text-sm);
    color: var(--color-heading);
    background: var(--control-bg);
    border: 1px solid var(--control-border);
    border-radius: var(--radius-sm);
    transition:
      border-color 160ms cubic-bezier(0.2, 0, 0, 1),
      box-shadow 160ms cubic-bezier(0.2, 0, 0, 1);
  }

  .input::placeholder {
    color: var(--color-muted);
  }

  .input:hover:not(:disabled) {
    border-color: var(--control-border-hover);
  }

  /* The theme's focus: --control-focus-border and --control-focus-shadow (Fusion: a blue border and glow). */
  .input:focus-visible {
    outline: none;
    border-color: var(--control-focus-border);
    box-shadow: var(--control-focus-shadow);
  }

  .input:disabled {
    color: var(--color-muted);
    background: var(--color-sunken);
    cursor: not-allowed;
  }

  .input[aria-invalid='true'] {
    border-color: var(--color-danger);
  }

  .input[aria-invalid='true']:focus-visible {
    border-color: var(--color-danger);
    box-shadow: var(--control-invalid-focus-shadow);
  }

  .small {
    width: auto;
    height: var(--control-height-sm);
    min-height: var(--control-height-sm);
    font-size: var(--text-sm);
  }
</style>
