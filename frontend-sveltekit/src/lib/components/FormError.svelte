<!-- The error for a form, read out by screen readers as it appears (role="alert" is assertive). -->
<script lang="ts">
  let { message, id }: { message: string; id?: string } = $props();
</script>

<div {id} role="alert">
  {#if message}<p class="error">{message}</p>{/if}
</div>
