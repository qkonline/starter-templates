<!--
  A boxed message that stands out from the page: "You were signed out", "Confirm your email"
  (DaisyUI's alert, soft). `tone` is warning (the default), info, success or error.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  type Tone = 'warning' | 'info' | 'success' | 'error';

  let {
    tone = 'warning',
    solid = false,
    children,
    class: extra,
    ...rest
  }: HTMLAttributes<HTMLDivElement> & { tone?: Tone; solid?: boolean; children: Snippet } = $props();

  // Written out in full: Tailwind builds only the class names it finds in the source.
  const tones = {
    warning: 'alert-warning',
    info: 'alert-info',
    success: 'alert-success',
    error: 'alert-error',
  };
</script>

<div {...rest} class={['notice alert', tones[tone], { 'alert-soft': !solid }, extra]}>
  <div>{@render children()}</div>
</div>

<style>
  .notice {
    display: block;
    font-size: var(--text-sm);
  }

  /* Space below, unless last; a .stack or .row replaces it with its gap (src/app.css). */
  :where(.notice) {
    margin: 0 0 var(--flow-space);
  }

  :where(.notice:last-child) {
    margin-block-end: 0;
  }
</style>
