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

<select
  bind:this={ref}
  bind:value
  id={field?.id}
  aria-describedby={field?.describedby}
  aria-invalid={field?.invalid || undefined}
  {...rest}
  class={['select', small ? 'select-sm w-auto' : 'w-full', { 'select-error': field?.invalid }, extra]}
>
  {@render children()}
</select>
