<!-- Contact messages and feedback (PRD R6.4): open or done, newest first. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type Message } from '#lib/api/index.ts';
  import { formatWhen, mailtoHref } from '#lib/format.ts';
  import { Pager } from '#lib/pager.svelte.ts';
  import { Task } from '#lib/task.svelte.ts';
  import FormError from '#lib/components/FormError.svelte';
  import Badge from '#lib/components/ui/Badge.svelte';
  import Button from '#lib/components/ui/Button.svelte';
  import List from '#lib/components/ui/List.svelte';
  import Panel from '#lib/components/ui/Panel.svelte';
  import Segmented from '#lib/components/ui/Segmented.svelte';
  import { msg, t } from '#lib/i18n/index.svelte.ts';

  const statuses = [
    { value: 'open', label: msg('Open') },
    { value: 'done', label: msg('Done') },
  ] as const;

  let status = $state<'open' | 'done'>('open');
  let changing = $state<string | null>(null);
  const change = new Task();
  const list = new Pager<Message>(
    async (cursor) => {
      const r = await api.adminMessages(status, cursor);
      return { items: r.messages, next: r.next };
    },
    (m) => m.id,
  );

  onMount(() => list.reload());

  function show(s: 'open' | 'done') {
    status = s;
    list.reload();
  }

  function mark(m: Message, to: 'open' | 'done') {
    changing = m.id;
    change
      .run(async () => {
        await api.adminMessageStatus(m.id, to);
        // It belongs to the other list now.
        list.remove(m.id);
      })
      .finally(() => (changing = null));
  }
</script>

<div class="stack">
  <div class="row spread">
    <h1>{t('Messages')}</h1>
    <Segmented
      legend={t('Show')}
      hideLegend
      options={statuses.map((s) => ({ ...s, label: t(s.label) }))}
      value={status}
      onchange={show}
    />
  </div>
  <FormError message={list.error || change.error} />
  {#if list.loaded && list.items.length === 0}
    <p class="muted">{status === 'open' ? t('Nothing waiting.') : t('Nothing marked done yet.')}</p>
  {/if}
  <Panel>
    <List>
      {#each list.items as m (m.id)}
        <li class="message">
          <div class="stack tight">
            <p class="small">
              <Badge>{m.kind === 'feedback' ? t('Feedback') : t('Contact')}</Badge>
              <strong>{m.name ?? m.email}</strong>
              {#if m.name}<span class="muted">&lt;{m.email}&gt;</span>{/if}
              <span class="muted">· {formatWhen(m.createdAt)}</span>
            </p>
            <p class="text">{m.message}</p>
            {#if m.page}<p class="muted small">{t('On {page}', { page: m.page })}</p>{/if}
            <p class="small"><a href={mailtoHref(m.email)}>{t('Reply by email')}</a></p>
          </div>
          <Button
            type="button"
            size="small"
            disabled={changing === m.id}
            onclick={() => mark(m, status === 'open' ? 'done' : 'open')}
          >
            {status === 'open' ? t('Mark done') : t('Open again')}
          </Button>
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

<style>
  .spread {
    justify-content: space-between;
  }

  .message {
    align-items: flex-start;
  }

  .tight {
    gap: var(--space-1);
    min-width: 0;
    flex: 1;
  }

  .text {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .message :global(.badge) {
    margin: 0 var(--space-2) 0 0;
  }
</style>
