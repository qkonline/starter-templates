<!--
  Rows with a hairline between them (devices, passkeys, members), in DaisyUI's list:
  <List><li>…</li></List>. Each <li> lays its parts out in a row that wraps; a `.title` inside
  one is set in the medium weight.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  let {
    children,
    class: extra,
    ...rest
  }: HTMLAttributes<HTMLUListElement> & { children: Snippet } = $props();
</script>

<ul {...rest} class={['list', extra]}>{@render children()}</ul>

<style>
  .list > :global(li) {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2) var(--space-4);
    padding: var(--space-3) 0;
  }

  .list > :global(li + li) {
    border-top: var(--border) solid var(--color-base-300);
  }

  .list > :global(li:first-child) {
    padding-top: 0;
  }

  .list > :global(li:last-child) {
    padding-bottom: 0;
  }

  .list :global(.title) {
    font-weight: var(--weight-medium);
    color: var(--color-heading);
  }

  /* Space below, unless last; a .stack or .row replaces it with its gap (src/app.css). */
  :where(.list) {
    margin: 0 0 var(--flow-space);
  }

  :where(.list:last-child) {
    margin-block-end: 0;
  }
</style>
