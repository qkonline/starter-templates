<!--
  A text input. Inside a <Field> it takes its id and descriptions from there; anything else
  (type, autocomplete, maxlength, …) goes straight to the <input>. `end` puts a small control
  inside its right edge (PasswordInput's Show).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLInputAttributes } from 'svelte/elements';
  import { getField } from './field.ts';

  let {
    value = $bindable(),
    ref = $bindable(),
    code = false,
    end,
    class: extra,
    ...rest
  }: Omit<HTMLInputAttributes, 'value'> & {
    value?: string | number | null;
    ref?: HTMLInputElement;
    /** Wide-spaced monospace, for one-time codes. */
    code?: boolean;
    end?: Snippet;
  } = $props();

  const field = getField();
</script>

{#snippet control()}
  <input
    bind:this={ref}
    bind:value
    id={field?.id}
    aria-describedby={field?.describedby}
    aria-invalid={field?.invalid || undefined}
    {...rest}
    class={['input', { code, 'has-end': end }, extra]}
  />
{/snippet}

{#if end}
  <div class="wrap">
    {@render control()}
    <div class="end">{@render end()}</div>
  </div>
{:else}
  {@render control()}
{/if}

<style>
  .input {
    width: 100%;
    min-height: var(--control-height);
    padding: 0 var(--control-padding-x);
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

  .code {
    font-family: var(--font-mono);
    font-size: var(--text-lg);
    letter-spacing: 0.3em;
  }

  .wrap {
    position: relative;
  }

  .has-end {
    padding-right: 4.5rem;
  }

  .end {
    position: absolute;
    right: var(--space-1);
    top: 50%;
    transform: translateY(-50%);
  }
</style>
