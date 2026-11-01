<!-- What admins did (PRD R6.4): support sessions, suspensions and deletions, kept a year. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type AuditEntry } from '#lib/api/index.ts';
  import { formatWhen } from '#lib/format.ts';
  import { Pager } from '#lib/pager.svelte.ts';
  import FormError from '#lib/components/FormError.svelte';
  import Button from '#lib/components/ui/Button.svelte';
  import List from '#lib/components/ui/List.svelte';
  import Panel from '#lib/components/ui/Panel.svelte';
  import Trans from '#lib/components/Trans.svelte';
  import { msg, t } from '#lib/i18n/index.svelte.ts';

  const actions: Record<AuditEntry['action'], string> = {
    support: msg('<b>{admin}</b> opened a support session as <b>{target}</b>'),
    suspend: msg('<b>{admin}</b> suspended <b>{target}</b>'),
    unsuspend: msg('<b>{admin}</b> unsuspended <b>{target}</b>'),
    delete: msg('<b>{admin}</b> deleted the account of <b>{target}</b>'),
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
  <h1>{t('Audit log')}</h1>
  <FormError message={list.error} />
  {#if list.loaded && list.items.length === 0}
    <p class="muted">{t('Nothing yet.')}</p>
  {/if}
  <Panel>
    <List>
      {#each list.items as e (e.id)}
        <li>
          <div>
            <p>
              <Trans text={actions[e.action]} vars={{ admin: who(e.admin), target: who(e.target) }}>
                {#snippet b(s: string)}<strong>{s}</strong>{/snippet}
              </Trans>
              {#if e.target.name}<span class="muted small">{e.target.email}</span>{/if}
            </p>
            {#if e.detail}<p class="muted small">“{e.detail}”</p>{/if}
          </div>
          <span class="muted small">{formatWhen(e.at)}</span>
        </li>
      {/each}
    </List>
  </Panel>
  {#if list.more}
    <div>
      <Button type="button" size="small" disabled={list.loading} onclick={() => list.loadMore()}
        >{t('Show more')}</Button
      >
    </div>
  {/if}
</div>
