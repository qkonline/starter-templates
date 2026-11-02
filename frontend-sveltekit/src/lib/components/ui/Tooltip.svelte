<!--
  A few words that show on hover or focus (DaisyUI's tooltip). The words are also given to
  screen readers as the description of what's inside. Keep them a hint: a touch screen has no
  hover, so nothing needed should be only here.

    <Tooltip text="Copied links work for 7 days"><Button>Copy link</Button></Tooltip>
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  const uid = $props.id();

  let {
    text,
    side = 'top',
    children,
  }: { text: string; side?: 'top' | 'bottom' | 'left' | 'right'; children: Snippet } = $props();

  // Written out in full: Tailwind builds only the class names it finds in the source.
  const sides = {
    top: 'tooltip-top',
    bottom: 'tooltip-bottom',
    left: 'tooltip-left',
    right: 'tooltip-right',
  };

  let box: HTMLElement;

  // The first focusable thing inside is described by the tooltip's words.
  $effect(() => {
    const target = box.querySelector<HTMLElement>('a, button, input, select, textarea, [tabindex]');
    target?.setAttribute('aria-describedby', `${uid}-tip`);
  });
</script>

<span bind:this={box} class={['tooltip', sides[side]]}>
  <span class="tooltip-content" id="{uid}-tip" role="tooltip">{text}</span>
  {@render children()}
</span>
