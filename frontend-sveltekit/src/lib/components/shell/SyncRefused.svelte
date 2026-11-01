<!--
  Changes the backend refused (a record deleted on another device, one grown too large): said to
  the person who made them, never only dropped (docs/offline-data.md, Rule 7).
-->
<script lang="ts">
  import { dismissRefused, syncState } from '#lib/db/index.svelte.ts';
  import Button from '../ui/Button.svelte';

  const refused = $derived(syncState.refused);
  // The same message once, however many changes it was for.
  const messages = $derived([...new Set(refused.map((r) => r.message).filter(Boolean))]);
</script>

{#if refused.length}
  <div class="refused" role="alert">
    <div class="in">
      <p>
        {refused.length === 1
          ? 'A change made here wasn’t kept.'
          : `${refused.length} changes made here weren’t kept.`}
        {#each messages as m (m)}<span class="why">{m}</span>{/each}
      </p>
      <Button type="button" size="small" onclick={dismissRefused}>OK</Button>
    </div>
  </div>
{/if}

<style>
  .refused {
    color: var(--color-heading);
    background: var(--color-danger-soft);
    border-bottom: 1px solid var(--color-danger-border);
  }

  .in {
    max-width: var(--page-width);
    margin: 0 auto;
    padding: var(--space-3) var(--space-4);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2) var(--space-4);
  }

  p {
    margin: 0;
    font-size: var(--text-sm);
  }

  .why {
    display: block;
    color: var(--color-text);
  }
</style>
