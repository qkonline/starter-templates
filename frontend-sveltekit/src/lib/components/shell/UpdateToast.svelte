<!--
  "A new version is ready": shown once the service worker has the new version waiting. It is
  applied only when the person taps Reload, never in the middle of what they're doing (PRD R3.1).
-->
<script lang="ts">
  import { applyUpdate, pwa } from '#lib/pwa.svelte.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
  import Button from '../ui/Button.svelte';

  let later = $state(false);
</script>

{#if pwa.updateReady && !later}
  <!-- DaisyUI's toast: pinned to the bottom corner, above the page. -->
  <div class="toast toast-end" role="status">
    <div class="alert pop">
      <span>{t('A new version is ready.')}</span>
      <div class="row">
        <Button type="button" size="small" variant="primary" onclick={applyUpdate}>{t('Reload')}</Button>
        <Button type="button" size="small" onclick={() => (later = true)}>{t('Later')}</Button>
      </div>
    </div>
  </div>
{/if}

<style>
  .toast {
    z-index: var(--z-pop);
    margin-bottom: env(safe-area-inset-bottom);
  }

  .alert {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3) var(--space-4);
  }

  .row {
    gap: var(--space-2);
  }
</style>
