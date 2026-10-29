<!-- What admins did (PRD R6.4): support sessions, suspensions and deletions, kept a year. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type AuditEntry } from '#lib/api/index.ts';
  import { formatWhen } from '#lib/format.ts';
  import { Pager } from '#lib/pager.svelte.ts';
  import FormError from '#lib/components/FormError.svelte';

  const actions: Record<AuditEntry['action'], string> = {
    support: 'opened a support session as',
    suspend: 'suspended',
    unsuspend: 'unsuspended',
    delete: 'deleted the account of',
  };
  const list = new Pager<AuditEntry>(
    async (cursor) => {
      const r = await api.adminAudit(cursor);
      return { items: r.entries, next: r.next };
    },
    (e) => e.id,
  );

  onMount(() => list.reload());

  const who = (p: { name: string | null; email: string }) => p.name ?? p.email;
</script>

<div class="stack">
  <h1>Audit log</h1>
  <FormError message={list.error} />
  {#if list.loaded && list.items.length === 0}
    <p class="muted">Nothing yet.</p>
  {/if}
  <ul class="list">
    {#each list.items as e (e.id)}
      <li>
        <div>
          <p>
            <strong>{who(e.admin)}</strong>
            {actions[e.action]} <strong>{who(e.target)}</strong>
            {#if e.target.name}<span class="muted small">{e.target.email}</span>{/if}
          </p>
          {#if e.detail}<p class="muted small">“{e.detail}”</p>{/if}
        </div>
        <span class="muted small">{formatWhen(e.at)}</span>
      </li>
    {/each}
  </ul>
  {#if list.more}
    <div>
      <button type="button" class="btn small" disabled={list.loading} onclick={() => list.loadMore()}
        >Show more</button
      >
    </div>
  {/if}
</div>
