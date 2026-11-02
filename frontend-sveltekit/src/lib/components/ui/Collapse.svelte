<!--
  A heading that opens to show more (DaisyUI's collapse, on <details>). Give several the same
  `group` and only one stays open at a time: an accordion.

    <Collapse title="What happens to my data?" group="faq">…</Collapse>
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    open = $bindable(false),
    group,
    icon = 'arrow',
    children,
    class: extra,
  }: {
    title: string | Snippet;
    open?: boolean;
    /** Collapses sharing a group open one at a time. */
    group?: string;
    icon?: 'arrow' | 'plus' | 'none';
    children: Snippet;
    class?: string;
  } = $props();

  // Written out in full: Tailwind builds only the class names it finds in the source.
  const icons = { arrow: 'collapse-arrow', plus: 'collapse-plus', none: '' };
</script>

<details class={['collapse flow', icons[icon], extra]} name={group} bind:open>
  <summary class="collapse-title"
    >{#if typeof title === 'string'}{title}{:else}{@render title()}{/if}</summary
  >
  <div class="collapse-content">{@render children()}</div>
</details>

<style>
  .collapse {
    background: var(--color-base-100);
    border: var(--border) solid var(--color-base-300);
    border-radius: var(--radius-box);
  }

  /* One after another, they read as one block. */
  :global(details.collapse) + .collapse {
    margin-top: calc(var(--flow-space) * -1 + var(--space-2));
  }

  .collapse-title {
    font-weight: var(--weight-medium);
    color: var(--color-heading);
  }
</style>
