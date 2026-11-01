<!--
  What the sync couldn't do, said to the person who made the changes, never only dropped
  (docs/offline-data.md, Rule 7):

  - Changes the backend refused (a record deleted on another device, a guarded field changed by
    someone else first, one grown too large, an app's own check). They're kept on the device
    with what they set until dismissed, so an app can show them beside the record
    (`syncState.refused[i].change.fields`) for the person to enter again.
  - Another tab opened a newer release, which upgraded the database: this tab must reload.
  - A team the backend turned away (the person was removed, the team deleted, or a switch turned
    off by mistake): its unsent changes are kept until the person discards them.
-->
<script lang="ts">
  import { discardSpace, dismissRefused, retryLost, syncState } from '#lib/db/index.svelte.ts';
  import ConfirmButton from '../ConfirmButton.svelte';
  import Button from '../ui/Button.svelte';

  const refused = $derived(syncState.refused);
  // The same message once, however many changes it was for.
  const messages = $derived([...new Set(refused.map((r) => r.message).filter(Boolean))]);
  const waiting = (n: number) =>
    n === 1 ? '1 change made here for it is' : `${n} changes made here for it are`;
</script>

{#if syncState.stale}
  <div class="refused" role="alert">
    <div class="in">
      <p>This app was updated in another tab. Reload to carry on; nothing made here is lost.</p>
      <Button type="button" size="small" variant="primary" onclick={() => location.reload()}>Reload</Button>
    </div>
  </div>
{/if}

{#if refused.length}
  <div class="refused" role="alert">
    <div class="in">
      <p>
        {refused.length === 1
          ? 'A change made here wasn’t kept.'
          : `${refused.length} changes made here weren’t kept.`}
        {#each messages as m (m)}<span class="why">{m}</span>{/each}
      </p>
      <Button type="button" size="small" onclick={() => dismissRefused()}>OK</Button>
    </div>
  </div>
{/if}

{#each syncState.lost as l (l.space)}
  <div class="refused" role="alert">
    <div class="in">
      <p>
        A team’s shared data can’t be reached: you may have been removed from it, or it was deleted.
        {#if l.pending}<span class="why">{waiting(l.pending)} kept on this device.</span>{/if}
      </p>
      <div class="row">
        <Button type="button" size="small" onclick={() => retryLost()}>Try again</Button>
        <ConfirmButton
          label="Discard"
          confirmLabel="Discard them"
          question="Delete this team’s data from this device, unsent changes too? This can’t be undone."
          onconfirm={() => discardSpace(l.space)}
        />
      </div>
    </div>
  </div>
{/each}

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

  .row {
    gap: var(--space-2);
  }
</style>
