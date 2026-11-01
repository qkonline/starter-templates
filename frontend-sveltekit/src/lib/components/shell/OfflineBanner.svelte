<!-- A quiet line while the device is offline: the app still opens, but nothing new loads (PRD R3.1). -->
<script lang="ts">
  import { pwa } from '#lib/pwa.svelte.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
</script>

{#if !pwa.online}
  <div class="offline" role="status">
    <p>{t('You’re offline. What’s already open still works; anything new waits until you’re connected.')}</p>
  </div>
{/if}

<style>
  .offline {
    background: var(--color-sunken);
    border-bottom: 1px solid var(--color-border);
  }

  p {
    max-width: var(--page-width);
    margin: 0 auto;
    padding: var(--space-2) var(--space-4);
    font-size: var(--text-sm);
    color: var(--color-muted);
  }
</style>
