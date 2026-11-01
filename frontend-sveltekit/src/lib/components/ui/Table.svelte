<!-- A plain data table (admin): <Table><thead>…</thead><tbody>…</tbody></Table>. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLTableAttributes } from 'svelte/elements';

  let { children, class: extra, ...rest }: HTMLTableAttributes & { children: Snippet } = $props();
</script>

<table {...rest} class={['table', extra]}>{@render children()}</table>

<style>
  .table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }

  .table :global(:is(th, td)) {
    padding: var(--space-3) var(--space-3);
    text-align: left;
    vertical-align: top;
    border-bottom: 1px solid var(--color-border);
  }

  .table :global(th) {
    color: var(--color-heading);
    font-weight: var(--weight-medium);
    background: var(--table-head-bg);
  }

  /* Space below, unless last; a .stack or .row replaces it with its gap (src/app.css). */
  :where(.table) {
    margin: 0 0 var(--flow-space);
  }

  :where(.table:last-child) {
    margin-block-end: 0;
  }
</style>
