<!--
  A text input. Inside a <Field> it takes its id and descriptions from there; anything else
  (type, autocomplete, maxlength, …) goes straight to the <input>. `end` puts a small control
  inside its right edge (PasswordInput's Show).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ClassValue, HTMLInputAttributes } from 'svelte/elements';
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

{#snippet control(classes: ClassValue)}
  <input
    bind:this={ref}
    bind:value
    id={field?.id}
    aria-describedby={field?.describedby}
    aria-invalid={field?.invalid || undefined}
    {...rest}
    class={classes}
  />
{/snippet}

{#if end}
  <!-- DaisyUI's way to put something inside the field: the box around both. A <div>, not
       DaisyUI's <label>, so the control's text doesn't join the input's name. -->
  <div class={['input w-full', { 'input-error': field?.invalid }]}>
    {@render control(['grow', { code }, extra])}
    {@render end()}
  </div>
{:else}
  {@render control(['input w-full', { code, 'input-error': field?.invalid }, extra])}
{/if}

<style>
  /* One-time codes: wide-spaced digits. */
  .code {
    font-family: var(--font-mono);
    font-size: var(--text-lg);
    letter-spacing: 0.4em;
  }
</style>
