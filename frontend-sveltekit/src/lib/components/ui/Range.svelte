<!--
  A slider (DaisyUI's range). Inside a <Field> it takes its id and descriptions from there;
  anything else (min, max, step, oninput…) goes straight to the <input>.

    <Field label="Volume"><Range bind:value={volume} min={0} max={100} /></Field>
-->
<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';
  import { getField } from './field.ts';

  let {
    value = $bindable(0),
    tone = 'primary',
    size = 'md',
    class: extra,
    ...rest
  }: Omit<HTMLInputAttributes, 'type' | 'value' | 'size'> & {
    value?: number;
    tone?: 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'error' | 'neutral';
    size?: 'xs' | 'sm' | 'md' | 'lg';
  } = $props();

  const field = getField();

  // Written out in full: Tailwind builds only the class names it finds in the source.
  const tones = {
    primary: 'range-primary',
    secondary: 'range-secondary',
    accent: 'range-accent',
    success: 'range-success',
    warning: 'range-warning',
    error: 'range-error',
    neutral: 'range-neutral',
  };
  const sizes = { xs: 'range-xs', sm: 'range-sm', md: '', lg: 'range-lg' };
</script>

<input
  type="range"
  bind:value
  id={field?.id}
  aria-describedby={field?.describedby}
  {...rest}
  class={['range w-full', tones[tone], sizes[size], extra]}
/>
