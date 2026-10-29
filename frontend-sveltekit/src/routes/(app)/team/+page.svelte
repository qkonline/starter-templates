<!--
  One team, `/team?id=…` (PRD R5.1 to R5.3). Everyone sees the members and can leave; admins
  rename, delete, change roles, remove members and send, resend or withdraw invites. A team never
  loses its last admin: the buttons that would do it say why instead, and `last_admin` from the
  backend (two admins at once) is shown with what to do.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import {
    ApiError,
    api,
    type Member,
    type Role,
    type SentInvite,
    type TeamSummary,
  } from '#lib/api/index.ts';
  import { appName } from '#lib/config.ts';
  import { emailProblem } from '#lib/password.ts';
  import { auth } from '#lib/session.svelte.ts';
  import { Task } from '#lib/task.svelte.ts';
  import { expiresIn, isLastAdmin, lastAdminHint, roleLabel, roles } from '#lib/teams.ts';
  import Avatar from '#lib/components/Avatar.svelte';
  import ConfirmButton from '#lib/components/ConfirmButton.svelte';
  import ConfirmEmailFirst from '#lib/components/ConfirmEmailFirst.svelte';
  import FormError from '#lib/components/FormError.svelte';
  import SubmitButton from '#lib/components/SubmitButton.svelte';

  // Derived: going from one team to another (the bell, a link) stays on this page with a new `id`.
  const teamId = $derived(page.url.searchParams.get('id') ?? '');
  const me = $derived(auth.user!);

  let team = $state<TeamSummary | null>(null);
  let members = $state<Member[]>([]);
  let invites = $state<SentInvite[]>([]);
  let missing = $state(false);
  let status = $state('');
  let newName = $state('');
  let inviteEmail = $state('');
  let inviteRole = $state<Role>('member');
  let deleteTyped = $state('');

  // Replaced for each team, so a load still running for the last one never holds this one back.
  let load = $state(new Task());
  const rename = new Task();
  const people = new Task();
  const inviting = new Task();
  const pending = new Task();
  const removal = new Task();

  const admin = $derived(team?.role === 'admin');

  function reload() {
    const id = teamId;
    return load.run(async () => {
      try {
        const r = await api.team(id);
        // Another team was opened meanwhile: this answer is no longer wanted.
        if (id !== teamId) return;
        team = r.team;
        members = r.members;
        invites = r.invites;
        newName = r.team.name;
      } catch (e) {
        if (id !== teamId) return;
        if (e instanceof ApiError && e.code === 'not_found') missing = true;
        else throw e;
      }
    });
  }

  // Each team that's opened starts from nothing: no members, messages or errors of the last.
  $effect(() => {
    const id = teamId;
    untrack(() => {
      team = null;
      members = [];
      invites = [];
      missing = false;
      status = '';
      deleteTyped = '';
      inviteEmail = '';
      for (const task of [rename, people, inviting, pending, removal]) task.clear();
      load = new Task();
      if (!id || !auth.features?.teams) missing = true;
      else reload();
    });
  });

  /** Run `work`; on `last_admin`, add what to do about it, then show the team as it is now. */
  function act(task: Task, work: () => Promise<unknown>, done?: string) {
    status = '';
    return task.run(work).then(async (ok) => {
      if (ok && done) status = done;
      if (!ok && task.code === 'last_admin') {
        task.error = `${task.error} ${lastAdminHint}`;
        await reload();
      }
      if (!ok && task.code === 'forbidden') await reload();
      return ok;
    });
  }

  function saveName(e: SubmitEvent) {
    e.preventDefault();
    act(
      rename,
      async () => {
        team = await api.renameTeam(teamId, newName);
        newName = team.name;
      },
      'Renamed.',
    );
  }

  function changeRole(m: Member, role: Role) {
    act(
      people,
      async () => {
        const updated = await api.setRole(teamId, m.userId, role);
        members = members.map((x) => (x.userId === m.userId ? updated : x));
        if (m.userId === me.id && team) team = { ...team, role };
      },
      `${m.name ?? m.email} is now ${role === 'admin' ? 'an admin' : 'a member'}.`,
    ).then((ok) => {
      // The menu already shows the new role; show the team as it really is.
      if (!ok) reload();
    });
  }

  function remove(m: Member) {
    act(
      people,
      async () => {
        await api.removeMember(teamId, m.userId);
        members = members.filter((x) => x.userId !== m.userId);
      },
      `${m.name ?? m.email} is no longer in the team.`,
    );
  }

  function leave() {
    act(people, async () => {
      await api.removeMember(teamId, me.id);
      await goto(resolve('teams'));
    });
  }

  function sendInvite(e: SubmitEvent) {
    e.preventDefault();
    const problem = emailProblem(inviteEmail);
    if (problem) {
      inviting.error = problem;
      return;
    }
    act(
      inviting,
      async () => {
        const invite = await api.invite(teamId, inviteEmail.trim(), inviteRole);
        invites = [invite, ...invites];
        inviteEmail = '';
      },
      'Invite sent.',
    );
  }

  function resend(invite: SentInvite) {
    act(pending, () => api.resendInvite(teamId, invite.id), `Sent again to ${invite.email}.`);
  }

  function withdraw(invite: SentInvite) {
    act(
      pending,
      async () => {
        await api.revokeInvite(teamId, invite.id);
        invites = invites.filter((i) => i.id !== invite.id);
      },
      `The invite to ${invite.email} is withdrawn.`,
    );
  }

  function deleteTeam() {
    if (deleteTyped.trim() !== team?.name) {
      removal.error = 'Type the team’s name exactly as shown to confirm.';
      return;
    }
    act(removal, async () => {
      await api.deleteTeam(teamId);
      await goto(resolve('teams'));
    });
  }
</script>

<svelte:head><title>{team?.name ?? 'Team'} · {appName}</title></svelte:head>

{#if missing}
  <div class="stack">
    <h1>Team not found</h1>
    <p class="muted">It may have been deleted, or you’re no longer in it.</p>
    <p><a href={resolve('teams')}>Your teams</a></p>
  </div>
{:else if !team}
  {#if load.error}<FormError message={load.error} />{:else}<p class="muted">Loading…</p>{/if}
{:else}
  <div class="page">
    <header class="head">
      <p class="small"><a href={resolve('teams')}>Teams</a></p>
      <h1>{team.name}</h1>
      <p class="muted small">
        {members.length}
        {members.length === 1 ? 'member' : 'members'} · You’re {admin ? 'an admin' : 'a member'}
      </p>
      <p class="success" role="status">{status}</p>
    </header>

    <section aria-labelledby="members-h">
      <h2 id="members-h">Members</h2>
      <ul class="list">
        {#each members as m (m.userId)}
          {@const self = m.userId === me.id}
          {@const onlyAdmin = isLastAdmin(members, m.userId)}
          <li>
            <div class="person">
              <Avatar user={m} size={32} />
              <div>
                <p class="title">
                  {m.name ?? m.email}{#if self}<span class="badge">You</span>{/if}
                </p>
                <p class="muted small">{m.name ? m.email : ''}</p>
              </div>
            </div>
            <div class="row">
              {#if admin}
                <label class="visually-hidden" for="role-{m.userId}">Role of {m.name ?? m.email}</label>
                <select
                  id="role-{m.userId}"
                  class="input select"
                  value={m.role}
                  disabled={people.busy || (onlyAdmin && m.role === 'admin')}
                  title={onlyAdmin ? 'The team’s only admin can’t step down.' : undefined}
                  onchange={(e) => changeRole(m, e.currentTarget.value as Role)}
                >
                  {#each roles as r (r.value)}<option value={r.value}>{r.label}</option>{/each}
                </select>
              {:else}
                <span class="muted small">{roleLabel(m.role)}</span>
              {/if}
              {#if self}
                {#if onlyAdmin}
                  <span class="muted small">You’re the only admin. {lastAdminHint}</span>
                {:else}
                  <ConfirmButton
                    label="Leave"
                    confirmLabel="Leave {team.name}"
                    question="Leave this team? You’ll need a new invite to come back."
                    disabled={people.busy}
                    onconfirm={leave}
                  />
                {/if}
              {:else if admin}
                <ConfirmButton
                  label="Remove"
                  confirmLabel="Remove {m.name ?? m.email}"
                  question="Remove {m.name ?? m.email} from the team?"
                  disabled={people.busy || onlyAdmin}
                  onconfirm={() => remove(m)}
                />
              {/if}
            </div>
          </li>
        {/each}
      </ul>
      <FormError message={people.error} />
    </section>

    {#if admin}
      <section aria-labelledby="invite-h">
        <h2 id="invite-h">Invite someone</h2>
        <form class="stack narrow" onsubmit={sendInvite} novalidate>
          <div class="field">
            <label for="invite-email">Email</label>
            <input
              id="invite-email"
              class="input"
              type="email"
              bind:value={inviteEmail}
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
            />
          </div>
          <div class="field">
            <label for="invite-role">Role</label>
            <select id="invite-role" class="input select" bind:value={inviteRole}>
              {#each roles as r (r.value)}<option value={r.value}>{r.label}</option>{/each}
            </select>
          </div>
          {#if inviting.code === 'email_unverified'}
            <ConfirmEmailFirst action="invite people" />
          {:else}
            <FormError message={inviting.error} />
          {/if}
          <div>
            <SubmitButton task={inviting} wide={false} busyLabel="Sending…">Send invite</SubmitButton>
          </div>
          <p class="hint">They get an email with a link that works for 7 days.</p>
        </form>

        {#if invites.length}
          <h3>Waiting to join</h3>
          <ul class="list">
            {#each invites as invite (invite.id)}
              <li>
                <div>
                  <p class="title">{invite.email}</p>
                  <p class="muted small">{roleLabel(invite.role)} · {expiresIn(invite.expiresAt)}</p>
                </div>
                <div class="row">
                  <button
                    type="button"
                    class="btn small"
                    disabled={pending.blocked}
                    onclick={() => resend(invite)}>Resend</button
                  >
                  <ConfirmButton
                    label="Withdraw"
                    confirmLabel="Withdraw invite"
                    question="Withdraw the invite to {invite.email}? Its link stops working."
                    disabled={pending.busy}
                    onconfirm={() => withdraw(invite)}
                  />
                </div>
              </li>
            {/each}
          </ul>
          {#if pending.code === 'email_unverified'}
            <ConfirmEmailFirst action="send the invite again" />
          {:else}
            <FormError message={pending.error} />
          {/if}
        {/if}
      </section>

      <section aria-labelledby="settings-h">
        <h2 id="settings-h">Settings</h2>
        <form class="stack narrow" onsubmit={saveName} novalidate>
          <div class="field">
            <label for="team-rename">Name</label>
            <input id="team-rename" class="input" bind:value={newName} maxlength="60" autocomplete="off" />
          </div>
          <FormError message={rename.error} />
          <div>
            <SubmitButton task={rename} wide={false} variant="plain" busyLabel="Saving…">Rename</SubmitButton>
          </div>
        </form>

        <div class="stack narrow">
          <h3>Delete the team</h3>
          <p class="muted small">
            Removes the team, its members and its invites, at once. This can’t be undone.
          </p>
          <ConfirmButton
            label="Delete team…"
            confirmLabel="Delete {team.name} for good"
            question="Type the team’s name to confirm."
            disabled={removal.busy}
            onconfirm={deleteTeam}
          >
            <label class="visually-hidden" for="delete-name">Team name</label>
            <input id="delete-name" class="input" bind:value={deleteTyped} autocomplete="off" />
          </ConfirmButton>
          <FormError message={removal.error} />
        </div>
      </section>
    {/if}
  </div>
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
  }

  .head {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding-bottom: var(--space-5);
  }

  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-6) 0;
    border-top: 1px solid var(--color-border);
  }

  .person {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .narrow {
    max-width: var(--form-width);
  }

  .select {
    width: auto;
    min-height: 2.25rem;
    font-size: var(--text-sm);
  }

  h3 {
    margin-top: var(--space-2);
    font-size: var(--text-sm);
  }
</style>
