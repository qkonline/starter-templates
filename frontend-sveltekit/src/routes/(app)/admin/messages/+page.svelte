<!-- Contact messages and feedback (PRD R6.4): open or done, newest first. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type Message } from '#lib/api/index.ts';
  import { formatWhen, mailtoHref } from '#lib/format.ts';
  import { Pager } from '#lib/pager.svelte.ts';
  import { Task } from '#lib/task.svelte.ts';
  import FormError from '#lib/components/FormError.svelte';

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
    <h1>Messages</h1>
    <div class="segmented" role="group" aria-label="Show">
      <button type="button" aria-pressed={status === 'open'} onclick={() => show('open')}>Open</button>
      <button type="button" aria-pressed={status === 'done'} onclick={() => show('done')}>Done</button>
    </div>
  </div>
  <FormError message={list.error || change.error} />
  {#if list.loaded && list.items.length === 0}
    <p class="muted">{status === 'open' ? 'Nothing waiting.' : 'Nothing marked done yet.'}</p>
  {/if}
  <ul class="list">
    {#each list.items as m (m.id)}
      <li class="message">
        <div class="stack tight">
          <p class="small">
            <span class="badge">{m.kind === 'feedback' ? 'Feedback' : 'Contact'}</span>
            <strong>{m.name ?? m.email}</strong>
            {#if m.name}<span class="muted">&lt;{m.email}&gt;</span>{/if}
            <span class="muted">· {formatWhen(m.createdAt)}</span>
          </p>
          <p class="text">{m.message}</p>
          {#if m.page}<p class="muted small">On {m.page}</p>{/if}
          <p class="small"><a href={mailtoHref(m.email)}>Reply by email</a></p>
        </div>
        <button
          type="button"
          class="btn small"
          disabled={changing === m.id}
          onclick={() => mark(m, status === 'open' ? 'done' : 'open')}
        >
          {status === 'open' ? 'Mark done' : 'Open again'}
        </button>
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

  .badge {
    margin: 0 var(--space-2) 0 0;
  }
</style>
