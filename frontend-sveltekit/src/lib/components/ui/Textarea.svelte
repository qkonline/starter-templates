<!-- A multi-line text field; like <Input>, it takes its id and descriptions from a <Field>. -->
<script lang="ts">
  import type { HTMLTextareaAttributes } from 'svelte/elements';
  import { getField } from './field.ts';

  let {
    value = $bindable(),
    ref = $bindable(),
    class: extra,
    ...rest
  }: Omit<HTMLTextareaAttributes, 'value'> & { value?: string; ref?: HTMLTextAreaElement } = $props();

  const field = getField();
</script>

<textarea
  bind:this={ref}
  bind:value
  id={field?.id}
  aria-describedby={field?.describedby}
  aria-invalid={field?.invalid || undefined}
  {...rest}
  class={['input', extra]}></textarea>

<style>
  .input {
    width: 100%;
    min-height: calc(var(--control-height) * 2);
    padding: var(--space-2) var(--control-padding-x);
    resize: vertical;
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
</style>
