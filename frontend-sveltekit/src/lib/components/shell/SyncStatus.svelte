<!--
  In the header while changes made on this device haven't reached the backend yet: how many, and
  whether they're going now. Nothing when everything is sent (PRD section 11).
-->
<script lang="ts">
  import { pwa } from '#lib/pwa.svelte.ts';
  import { syncState } from '#lib/db/index.svelte.ts';
  import { t, tn } from '#lib/i18n/index.svelte.ts';

  const n = $derived(syncState.pending);
  const label = $derived(tn(n, '1 change waiting', '{count} changes waiting'));
  const why = $derived(
    !pwa.online
      ? t('You’re offline. They’re kept on this device and sent when you’re connected.')
      : syncState.running
        ? t('Sending them now.')
        : (syncState.error ?? t('They’ll be sent in a moment.')),
  );
</script>

{#if n > 0}
  <span class={['sync', syncState.running && 'running']} role="status" title={why}>
    <span class="dot" aria-hidden="true"></span>
    <span class="text">{label}</span>
    <span class="visually-hidden">. {why}</span>
  </span>
{/if}

<style>
  .sync {
    align-self: center;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-2);
    font-size: var(--text-xs);
    line-height: 1.5rem;
    white-space: nowrap;
    color: var(--color-muted);
    background: var(--color-sunken);
    border: 1px solid var(--color-border);
    border-radius: var(--badge-radius);
  }

  .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--color-border-strong);
  }

  .running .dot {
    background: var(--color-accent);
    animation: pulse 1.2s ease-in-out infinite;
  }

  @keyframes pulse {
    50% {
      opacity: 0.3;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .running .dot {
      animation: none;
    }
  }

  @media (max-width: 30rem) {
    .text {
      display: none;
    }
  }
</style>
