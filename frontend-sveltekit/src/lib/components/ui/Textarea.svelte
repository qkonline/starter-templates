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
  class={['textarea w-full', { 'textarea-error': field?.invalid }, extra]}></textarea>
