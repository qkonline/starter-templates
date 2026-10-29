<!--
  "A new version is ready": shown once the service worker has the new version waiting. It is
  applied only when the person taps Reload, never in the middle of what they're doing (PRD R3.1).
-->
<script lang="ts">
  import { applyUpdate, pwa } from '#lib/pwa.svelte.ts';

  let later = $state(false);
</script>

{#if pwa.updateReady && !later}
  <div class="toast pop" role="status">
    <p>A new version is ready.</p>
    <div class="row">
      <button type="button" class="btn small primary" onclick={applyUpdate}>Reload</button>
      <button type="button" class="btn small" onclick={() => (later = true)}>Later</button>
    </div>
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    z-index: var(--z-pop);
    right: var(--space-4);
    bottom: calc(var(--space-4) + env(safe-area-inset-bottom));
    left: auto;
    max-width: calc(100vw - 2 * var(--space-4));
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3) var(--space-4);
    padding: var(--space-3) var(--space-4);
  }

  .row {
    gap: var(--space-2);
  }
</style>
