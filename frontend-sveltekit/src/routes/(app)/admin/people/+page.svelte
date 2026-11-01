<!--
  Finding people (PRD R6.2, R6.3): search, then suspend, unsuspend, delete, or open a support
  session in a tab of its own. Never on another admin: the backend refuses, and the buttons
  aren't shown.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { api, type AdminUser } from '#lib/api/index.ts';
  import { formatWhen } from '#lib/format.ts';
  import { Pager } from '#lib/pager.svelte.ts';
  import { Task } from '#lib/task.svelte.ts';
  import Avatar from '#lib/components/Avatar.svelte';
  import ConfirmButton from '#lib/components/ConfirmButton.svelte';
  import FormError from '#lib/components/FormError.svelte';
  import Badge from '#lib/components/ui/Badge.svelte';
  import Button from '#lib/components/ui/Button.svelte';
  import Field from '#lib/components/ui/Field.svelte';
  import Input from '#lib/components/ui/Input.svelte';
  import List from '#lib/components/ui/List.svelte';
  import Panel from '#lib/components/ui/Panel.svelte';

  let q = $state('');
  // Per person: what was typed in one row's form never carries over to another's.
  let reasons = $state<Record<string, string>>({});
  let typed = $state<Record<string, string>>({});
  let working = $state<string | null>(null);
  let status = $state('');
  const act = new Task();
  const list = new Pager<AdminUser>(
    async (cursor) => {
      const r = await api.adminUsers(q, cursor);
      return { items: r.users, next: r.next };
    },
    (u) => u.id,
  );

  onMount(() => list.reload());

  let timer: ReturnType<typeof setTimeout> | undefined;
  function search() {
    clearTimeout(timer);
    timer = setTimeout(() => list.reload(), 250);
  }

  /** Run `work` for one person; true when it worked. */
  function run(u: AdminUser, work: () => Promise<void>, done: string): Promise<boolean> {
    // Another action is still running: leave its row's state alone.
    if (act.blocked) return Promise.resolve(false);
    working = u.id;
    status = '';
    return act
      .run(async () => {
        await work();
        status = done;
      })
      .finally(() => (working = null));
  }

  const label = (u: AdminUser) => u.name ?? u.email;

  function suspend(u: AdminUser) {
    run(
      u,
      async () => {
        const updated = await api.adminSuspend(u.id, reasons[u.id]);
        list.update(u.id, () => updated);
        delete reasons[u.id];
      },
      `${label(u)} is suspended and signed out everywhere.`,
    );
  }

  function unsuspend(u: AdminUser) {
    run(
      u,
      async () => {
        const updated = await api.adminUnsuspend(u.id);
        list.update(u.id, () => updated);
      },
      `${label(u)} can sign in again.`,
    );
  }

  function remove(u: AdminUser) {
    if ((typed[u.id] ?? '').trim().toLowerCase() !== u.email) {
      act.error = `Type ${u.email} exactly to confirm.`;
      return;
    }
    run(
      u,
      async () => {
        await api.adminDeleteUser(u.id);
        list.remove(u.id);
        delete typed[u.id];
      },
      `${u.email}’s account is deleted.`,
    );
  }

  /**
   * Open the person's account in a new tab, signed in there only. The tab opens at once, on the
   * tap (a tab opened after waiting for the backend would be blocked as a pop-up), then goes to
   * the support page with the one-time code.
   */
  async function support(u: AdminUser) {
    if (act.blocked) return;
    const tab = window.open('about:blank', '_blank');
    const ok = await run(
      u,
      async () => {
        const code = await api.adminSupport(u.id);
        const url = `${resolve('support')}?code=${encodeURIComponent(code)}`;
        if (tab && !tab.closed) {
          tab.opener = null;
          tab.location.href = url;
        } else if (!window.open(url, '_blank', 'noopener')) {
          throw new Error('The browser blocked the new tab. Allow pop-ups for this site, then try again.');
        }
      },
      `Support session for ${u.email} opened in a new tab.`,
    );
    // It didn't start (it failed, or another action was still running): the blank tab goes too.
    if (!ok && tab && !tab.closed) tab.close();
  }
</script>

<div class="stack">
  <h1>People</h1>
  <div class="search">
    <Field label="Find by email or name" id="people-q">
      <Input
        type="search"
        bind:value={q}
        oninput={search}
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
      />
    </Field>
  </div>
  <p class="success" role="status">{status}</p>
  <FormError message={list.error || act.error} />
  {#if list.loaded && list.items.length === 0}
    <p class="muted">No one matches.</p>
  {/if}
  <Panel>
    <List>
      {#each list.items as u (u.id)}
        <li class="person">
          <div class="who">
            <Avatar user={u} size={36} />
            <div>
              <p class="title">
                {u.email}
                {#if u.isAdmin}<Badge>Admin</Badge>{/if}
                {#if u.suspended}<Badge tone="danger">Suspended</Badge>{/if}
                {#if !u.emailVerified}<Badge tone="plain">Not confirmed</Badge>{/if}
              </p>
              <p class="muted small">
                {#if u.name}{u.name} ·
                {/if}Joined {formatWhen(u.createdAt)} · {u.lastActiveAt
                  ? `Active ${formatWhen(u.lastActiveAt)}`
                  : 'Not signed in anywhere'}{#if u.teams !== null}
                  · {u.teams} {u.teams === 1 ? 'team' : 'teams'}{/if}
              </p>
            </div>
          </div>
          {#if !u.isAdmin}
            <div class="actions">
              {#if !u.suspended}
                <Button type="button" size="small" disabled={working === u.id} onclick={() => support(u)}
                  >Support sign-in</Button
                >
                <ConfirmButton
                  label="Suspend…"
                  confirmLabel="Suspend {label(u)}"
                  question="Suspend {u.email}? They’re signed out everywhere and can’t sign in until unsuspended."
                  disabled={working === u.id}
                  onconfirm={() => suspend(u)}
                >
                  <label class="small" for="reason-{u.id}"
                    >Reason, for the audit log (they never see it)</label
                  >
                  <Input id="reason-{u.id}" bind:value={reasons[u.id]} maxlength={500} autocomplete="off" />
                </ConfirmButton>
              {:else}
                <Button type="button" size="small" disabled={working === u.id} onclick={() => unsuspend(u)}
                  >Unsuspend</Button
                >
              {/if}
              <ConfirmButton
                label="Delete…"
                confirmLabel="Delete for good"
                question="Delete {u.email}’s account, with everything in it? This can’t be undone."
                disabled={working === u.id}
                onconfirm={() => remove(u)}
              >
                <label class="small" for="delete-{u.id}">Type {u.email} to confirm</label>
                <Input id="delete-{u.id}" bind:value={typed[u.id]} autocomplete="off" autocapitalize="off" />
              </ConfirmButton>
            </div>
          {/if}
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
  .search {
    max-width: var(--form-width);
  }

  .person {
    align-items: flex-start;
  }

  .who {
    display: flex;
    gap: var(--space-3);
    min-width: 0;
  }

  .title {
    overflow-wrap: anywhere;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--space-2);
  }
</style>
