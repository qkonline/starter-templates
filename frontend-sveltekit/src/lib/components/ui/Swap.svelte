<!--
  One of two things, switched by a click (DaisyUI's swap): a play/pause icon, a menu/close icon.
  A toggle button underneath (aria-pressed), named by `label`.

    <Swap label="Mute" bind:active={muted}>{#snippet on()}🔇{/snippet}{#snippet off()}🔊{/snippet}</Swap>
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    active = $bindable(false),
    effect = 'rotate',
    on,
    off,
    onchange,
  }: {
    label: string;
    active?: boolean;
    effect?: 'rotate' | 'flip' | 'none';
    on: Snippet;
    off: Snippet;
    onchange?: (active: boolean) => void;
  } = $props();

  // Written out in full: Tailwind builds only the class names it finds in the source.
  const effects = { rotate: 'swap-rotate', flip: 'swap-flip', none: '' };
</script>

<button
  type="button"
  class={['swap btn btn-ghost btn-square', effects[effect], { 'swap-active': active }]}
  aria-label={label}
  aria-pressed={active}
  onclick={() => {
    active = !active;
    onchange?.(active);
  }}
>
  <span class="swap-on" aria-hidden="true">{@render on()}</span>
  <span class="swap-off" aria-hidden="true">{@render off()}</span>
</button>
