<!--
  Where toast() messages show (DaisyUI's toast): the bottom corner, newest last, read out by
  screen readers as they appear. Once, in the root layout.
-->
<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';
  import { dismiss, toasts } from './toast.svelte.ts';

  // Written out in full: Tailwind builds only the class names it finds in the source.
  const tones = {
    info: 'alert-info',
    success: 'alert-success',
    warning: 'alert-warning',
    error: 'alert-error',
  };
</script>

<div class="toast toast-end" role="status" aria-live="polite">
  {#each toasts as item (item.id)}
    <div class={['alert alert-soft', tones[item.tone]]}>
      <span>{item.message}</span>
      <button type="button" class="btn btn-ghost btn-xs btn-square" onclick={() => dismiss(item.id)}
        ><span aria-hidden="true">✕</span><span class="visually-hidden">{t('Dismiss')}</span></button
      >
    </div>
  {/each}
</div>

<style>
  .toast {
    z-index: var(--z-pop);
    margin-bottom: env(safe-area-inset-bottom);
  }

  .toast:empty {
    display: none;
  }

  .alert {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    box-shadow: var(--shadow-pop);
  }
</style>
