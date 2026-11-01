<!-- Error and CSP reports (PRD R6.4, R7.2): deduplicated with counts, most recently seen first. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type ErrorReport } from '#lib/api/index.ts';
  import { formatWhen } from '#lib/format.ts';
  import { Pager } from '#lib/pager.svelte.ts';
  import { Task } from '#lib/task.svelte.ts';
  import ConfirmButton from '#lib/components/ConfirmButton.svelte';
  import FormError from '#lib/components/FormError.svelte';
  import Badge from '#lib/components/ui/Badge.svelte';
  import Button from '#lib/components/ui/Button.svelte';
  import List from '#lib/components/ui/List.svelte';
  import Panel from '#lib/components/ui/Panel.svelte';

  const kinds = { client: 'Browser', server: 'Server', csp: 'CSP' } as const;
  const clear = new Task();
  const list = new Pager<ErrorReport>(
    async (cursor) => {
      const r = await api.adminErrors(cursor);
      return { items: r.errors, next: r.next };
    },
    (e) => e.id,
  );

  onMount(() => list.reload());

  function clearAll() {
    clear.run(async () => {
      await api.adminClearErrors();
      await list.reload();
    });
  }
</script>

<div class="stack">
  <div class="row spread">
    <h1>Errors</h1>
    {#if list.items.length}
      <ConfirmButton
        label="Clear all…"
        confirmLabel="Clear every report"
        question="Clear every error and CSP report? New ones are kept as they come."
        disabled={clear.busy}
        onconfirm={clearAll}
      />
    {/if}
  </div>
  <FormError message={list.error || clear.error} />
  {#if list.loaded && list.items.length === 0}
    <p class="muted">No reports. When the app or a browser reports an error, it shows here.</p>
  {/if}
  <Panel>
    <List>
      {#each list.items as e (e.id)}
        <li>
          <details>
            <summary>
              <Badge>{kinds[e.kind]}</Badge>
              <span class="msg">{e.message}</span>
              <span class="muted small">
                ×{e.count} · last {formatWhen(e.lastSeen)} · first {formatWhen(e.firstSeen)}
              </span>
            </summary>
            <div class="stack detail small">
              {#if e.url}<p><span class="muted">Page</span> {e.url}</p>{/if}
              {#if e.release}<p><span class="muted">Version</span> {e.release}</p>{/if}
              {#if e.detail}<pre>{e.detail}</pre>{/if}
            </div>
          </details>
        </li>
      {/each}
    </List>
  </Panel>
  {#if list.more}
    <div>
      <Button type="button" size="small" disabled={list.loading} onclick={() => list.loadMore()}
        >Show more</Button
      >
    </div>
  {/if}
</div>

<style>
  .spread {
    justify-content: space-between;
  }

  details {
    width: 100%;
    min-width: 0;
  }

  summary {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-1) var(--space-2);
    cursor: pointer;
  }

  .msg {
    font-weight: var(--weight-medium);
    overflow-wrap: anywhere;
  }

  summary :global(.badge) {
    margin: 0;
  }

  .detail {
    padding: var(--space-3) 0 0;
    gap: var(--space-2);
    overflow-wrap: anywhere;
  }

  pre {
    margin: 0;
    padding: var(--space-3);
    overflow-x: auto;
    background: var(--color-sunken);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    white-space: pre;
  }
</style>
