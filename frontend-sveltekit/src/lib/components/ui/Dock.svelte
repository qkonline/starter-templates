<!--
  Buttons along the bottom of a phone screen (DaisyUI's dock): the app's main places, this one
  marked. Each item has an icon (a snippet) and its words.

    <Dock label="Main" items={[{ label: 'Home', href: resolve('app'), icon: homeIcon, current: true }, …]} />
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    items,
  }: {
    label: string;
    items: readonly { label: string; href: string; icon: Snippet; current?: boolean }[];
  } = $props();
</script>

<nav class="dock dock-sm" aria-label={label}>
  {#each items as item (item.href)}
    <a
      href={item.href}
      class={{ 'dock-active': item.current }}
      aria-current={item.current ? 'page' : undefined}
    >
      <span class="icon" aria-hidden="true">{@render item.icon()}</span>
      <span class="dock-label">{item.label}</span>
    </a>
  {/each}
</nav>

<style>
  .dock {
    z-index: var(--z-pop);
    background: var(--color-base-100);
    border-top: var(--border) solid var(--color-base-300);
    padding-bottom: env(safe-area-inset-bottom);
  }

  a {
    color: inherit;
    text-decoration: none;
  }

  .dock-active {
    color: var(--color-primary);
  }

  .icon {
    display: grid;
    place-items: center;
  }
</style>
