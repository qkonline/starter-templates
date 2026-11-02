<!--
  A data table (admin), DaisyUI's: <Table><thead>…</thead><tbody>…</tbody></Table>. It scrolls
  sideways on its own when it's wider than the page. `zebra` stripes the rows.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLTableAttributes } from 'svelte/elements';

  let {
    zebra = false,
    children,
    class: extra,
    ...rest
  }: HTMLTableAttributes & { zebra?: boolean; children: Snippet } = $props();
</script>

<div class="table-wrap">
  <table {...rest} class={['table', { 'table-zebra': zebra }, extra]}>{@render children()}</table>
</div>

<style>
  .table-wrap {
    overflow-x: auto;
  }

  /* Space below, unless last; a .stack or .row replaces it with its gap (src/app.css). */
  :where(.table-wrap) {
    margin: 0 0 var(--flow-space);
  }

  :where(.table-wrap:last-child) {
    margin-block-end: 0;
  }
</style>
