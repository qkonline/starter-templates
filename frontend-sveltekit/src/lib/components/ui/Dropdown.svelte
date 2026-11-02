<!--
  A button that opens a small list or panel under it (DaisyUI's dropdown, on <details>). It
  closes on Escape, on a click outside, and after a click on a link or button inside.

    <Dropdown label="Options">
      <Menu><li><button onclick={rename}>Rename</button></li></Menu>
    </Dropdown>
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    open = $bindable(false),
    align = 'start',
    up = false,
    variant = 'plain',
    size = 'md',
    children,
  }: {
    /** The button's words, or a snippet (an avatar, an icon with an aria-label inside). */
    label: string | Snippet;
    open?: boolean;
    /** Which edge of the button the list lines up with. */
    align?: 'start' | 'end';
    /** Opens upwards. */
    up?: boolean;
    variant?: 'plain' | 'ghost' | 'primary';
    size?: 'xs' | 'sm' | 'md';
    children: Snippet;
  } = $props();

  // Written out in full: Tailwind builds only the class names it finds in the source.
  const variants = { plain: '', ghost: 'btn-ghost', primary: 'btn-primary' };
  const sizes = { xs: 'btn-xs', sm: 'btn-sm', md: '' };

  let box: HTMLDetailsElement;

  $effect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!box.contains(e.target as Node)) open = false;
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      open = false;
      box.querySelector('summary')?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  });

  function chosen(e: MouseEvent) {
    if ((e.target as Element).closest('a, button')) open = false;
  }
</script>

<details
  bind:this={box}
  bind:open
  class={['dropdown', { 'dropdown-end': align === 'end', 'dropdown-top': up }]}
>
  <summary class={['btn', variants[variant], sizes[size]]}
    >{#if typeof label === 'string'}{label}{:else}{@render label()}{/if}</summary
  >
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="dropdown-content pop" onclick={chosen}>{@render children()}</div>
</details>

<style>
  summary {
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  .dropdown-content {
    z-index: var(--z-pop);
    min-width: 12rem;
    margin-block: var(--space-1);
    padding: var(--space-1);
  }
</style>
