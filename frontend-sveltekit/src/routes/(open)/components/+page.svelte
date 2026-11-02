<!-- The component gallery, in development only (see +page.ts). -->
<script lang="ts">
  const gallery = import.meta.env.DEV ? import('./Gallery.svelte') : undefined;
</script>

{#if gallery}
  {#await gallery then { default: Gallery }}<Gallery />{/await}
{/if}
