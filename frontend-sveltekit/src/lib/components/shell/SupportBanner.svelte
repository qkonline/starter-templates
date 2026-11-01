<!--
  In a support tab (PRD R6.3): always on top, saying whose account this is, with the way out.
  The admin's own session in their other tabs is untouched.
-->
<script lang="ts">
  import { auth, endSupportSession } from '#lib/session.svelte.ts';
  import Button from '../ui/Button.svelte';

  let ending = $state(false);

  function end() {
    ending = true;
    endSupportSession();
  }
</script>

{#if auth.support}
  <div class="support" role="region" aria-label="Support session">
    <p>Support session as <strong>{auth.support.email}</strong></p>
    <Button type="button" size="small" disabled={ending} onclick={end}>
      {ending ? 'Ending…' : 'End support session'}
    </Button>
  </div>
{/if}

<style>
  .support {
    position: sticky;
    top: 0;
    z-index: calc(var(--z-pop) + 1);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: var(--space-2) var(--space-4);
    padding: var(--space-2) var(--space-4);
    background: var(--color-danger);
    color: var(--color-bg);
    font-size: var(--text-sm);
  }

  .support :global(.btn) {
    color: var(--color-text);
  }
</style>
