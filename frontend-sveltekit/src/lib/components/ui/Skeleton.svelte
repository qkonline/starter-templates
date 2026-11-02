<!--
  A grey shape where something is still loading (DaisyUI's skeleton). Hidden from screen
  readers: say "Loading" once nearby (a role="status"), not on every shape.

    <Skeleton width="12rem" height="1rem" />  <Skeleton width="3rem" height="3rem" round />
-->
<script lang="ts">
  let {
    width = '100%',
    height = '1rem',
    round = false,
  }: { width?: string; height?: string; round?: boolean } = $props();
</script>

<div class="skeleton" class:round style:width style:height aria-hidden="true"></div>

<style>
  .round {
    border-radius: var(--radius-full);
  }
</style>
