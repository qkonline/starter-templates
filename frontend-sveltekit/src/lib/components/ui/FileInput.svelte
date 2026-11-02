<!--
  A file picker (DaisyUI's file input). Inside a <Field> it takes its id and descriptions from
  there; anything else (accept, multiple, onchange…) goes straight to the <input>.

    <Field label="Attachment"><FileInput accept="image/*" bind:files /></Field>
-->
<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';
  import { getField } from './field.ts';

  let {
    files = $bindable(),
    ref = $bindable(),
    size = 'md',
    class: extra,
    ...rest
  }: Omit<HTMLInputAttributes, 'type' | 'size'> & {
    files?: FileList | null;
    ref?: HTMLInputElement;
    size?: 'xs' | 'sm' | 'md' | 'lg';
  } = $props();

  const field = getField();
  // Written out in full: Tailwind builds only the class names it finds in the source.
  const sizes = { xs: 'file-input-xs', sm: 'file-input-sm', md: '', lg: 'file-input-lg' };
</script>

<input
  type="file"
  bind:this={ref}
  bind:files
  id={field?.id}
  aria-describedby={field?.describedby}
  aria-invalid={field?.invalid || undefined}
  {...rest}
  class={['file-input w-full', sizes[size], { 'file-input-error': field?.invalid }, extra]}
/>
