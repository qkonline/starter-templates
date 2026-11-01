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
  import { asRole, expiresIn, isLastAdmin, lastAdminHint, roleLabel, roles } from '#lib/teams.ts';
  import Avatar from '#lib/components/Avatar.svelte';
  import ConfirmButton from '#lib/components/ConfirmButton.svelte';
  import ConfirmEmailFirst from '#lib/components/ConfirmEmailFirst.svelte';
  import FormError from '#lib/components/FormError.svelte';
  import SubmitButton from '#lib/components/SubmitButton.svelte';
  import Badge from '#lib/components/ui/Badge.svelte';
  import Button from '#lib/components/ui/Button.svelte';
  import Field from '#lib/components/ui/Field.svelte';
  import Input from '#lib/components/ui/Input.svelte';
  import List from '#lib/components/ui/List.svelte';
  import Panel from '#lib/components/ui/Panel.svelte';
  import Select from '#lib/components/ui/Select.svelte';
  import { t, tn } from '#lib/i18n/index.svelte.ts';

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
        task.error = `${task.error} ${t(lastAdminHint)}`;
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
      t('Renamed.'),
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
      role === 'admin'
        ? t('{name} is now an admin.', { name: m.name ?? m.email })
        : t('{name} is now a member.', { name: m.name ?? m.email }),
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
      t('{name} is no longer in the team.', { name: m.name ?? m.email }),
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
      t('Invite sent.'),
    );
  }

  function resend(invite: SentInvite) {
    act(
      pending,
      () => api.resendInvite(teamId, invite.id),
      t('Sent again to {email}.', { email: invite.email }),
    );
  }

  function withdraw(invite: SentInvite) {
    act(
      pending,
      async () => {
        await api.revokeInvite(teamId, invite.id);
        invites = invites.filter((i) => i.id !== invite.id);
      },
      t('The invite to {email} is withdrawn.', { email: invite.email }),
    );
  }

  function deleteTeam() {
    if (deleteTyped.trim() !== team?.name) {
      removal.error = t('Type the team’s name exactly as shown to confirm.');
      return;
    }
    act(removal, async () => {
      await api.deleteTeam(teamId);
      await goto(resolve('teams'));
    });
  }
</script>

<svelte:head><title>{team?.name ?? t('Team')} · {appName}</title></svelte:head>

{#if missing}
  <div class="stack">
    <h1>{t('Team not found')}</h1>
    <p class="muted">{t('It may have been deleted, or you’re no longer in it.')}</p>
    <p><a href={resolve('teams')}>{t('Your teams')}</a></p>
  </div>
{:else if !team}
  {#if load.error}<FormError message={load.error} />{:else}<p class="muted">{t('Loading…')}</p>{/if}
{:else}
  <div class="page stack">
    <header class="head">
      <p class="small"><a href={resolve('teams')}>{t('Teams')}</a></p>
      <h1>{team.name}</h1>
      <p class="muted small">
        {tn(members.length, '1 member', '{count} members')} · {t('You’re {role}', {
          role: team ? asRole(team.role) : t('a member'),
        })}
      </p>
      <p class="success" role="status">{status}</p>
    </header>

    <Panel title={t('Members')}>
      <List>
        {#each members as m (m.userId)}
          {@const self = m.userId === me.id}
          {@const onlyAdmin = isLastAdmin(members, m.userId)}
          <li>
            <div class="person">
              <Avatar user={m} size={32} />
              <div>
                <p class="title">
                  {m.name ?? m.email}{#if self}<Badge>{t('You')}</Badge>{/if}
                </p>
                <p class="muted small">{m.name ? m.email : ''}</p>
                {#if self && onlyAdmin}<p class="muted small">
                    {t('You’re the only admin.')}
                    {t(lastAdminHint)}
                  </p>{/if}
              </div>
            </div>
            <div class="row">
              {#if admin}
                <label class="visually-hidden" for="role-{m.userId}"
                  >{t('Role of {name}', { name: m.name ?? m.email })}</label
                >
                <Select
                  id="role-{m.userId}"
                  small
                  value={m.role}
                  disabled={people.busy || (onlyAdmin && m.role === 'admin')}
                  title={onlyAdmin ? t('The team’s only admin can’t step down.') : undefined}
                  onchange={(e) => changeRole(m, e.currentTarget.value as Role)}
                >
                  {#each roles as r (r.value)}<option value={r.value}>{t(r.label)}</option>{/each}
                </Select>
              {:else}
                <span class="muted small">{roleLabel(m.role)}</span>
              {/if}
              {#if self}
                {#if !onlyAdmin}
                  <ConfirmButton
                    label={t('Leave')}
                    confirmLabel={t('Leave {team}', { team: team.name })}
                    question={t('Leave this team? You’ll need a new invite to come back.')}
                    disabled={people.busy}
                    onconfirm={leave}
                  />
                {/if}
              {:else if admin}
                <ConfirmButton
                  label={t('Remove')}
                  confirmLabel={t('Remove {name}', { name: m.name ?? m.email })}
                  question={t('Remove {name} from the team?', { name: m.name ?? m.email })}
                  disabled={people.busy || onlyAdmin}
                  onconfirm={() => remove(m)}
                />
              {/if}
            </div>
          </li>
        {/each}
      </List>
      <FormError message={people.error} />
    </Panel>

    {#if admin}
      <Panel title={t('Invite someone')}>
        <form class="stack narrow" onsubmit={sendInvite} novalidate>
          <Field
            label={t('Email')}
            id="invite-email"
            hint={t('They get an email with a link that works for 7 days.')}
          >
            <Input
              type="email"
              bind:value={inviteEmail}
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
            />
          </Field>
          <Field label={t('Role')} id="invite-role">
            <Select bind:value={inviteRole}>
              {#each roles as r (r.value)}<option value={r.value}>{t(r.label)}</option>{/each}
            </Select>
          </Field>
          {#if inviting.code === 'email_unverified'}
            <ConfirmEmailFirst action={t('invite people')} />
          {:else}
            <FormError message={inviting.error} />
          {/if}
          <div>
            <SubmitButton task={inviting} wide={false} busyLabel={t('Sending…')}
              >{t('Send invite')}</SubmitButton
            >
          </div>
        </form>

        {#if invites.length}
          <h3>{t('Waiting to join')}</h3>
          <List>
            {#each invites as invite (invite.id)}
              <li>
                <div>
                  <p class="title">{invite.email}</p>
                  <p class="muted small">{roleLabel(invite.role)} · {expiresIn(invite.expiresAt)}</p>
                </div>
                <div class="row">
                  <Button type="button" size="small" disabled={pending.blocked} onclick={() => resend(invite)}
                    >{t('Resend')}</Button
                  >
                  <ConfirmButton
                    label={t('Withdraw')}
                    confirmLabel={t('Withdraw invite')}
                    question={t('Withdraw the invite to {email}? Its link stops working.', {
                      email: invite.email,
                    })}
                    disabled={pending.busy}
                    onconfirm={() => withdraw(invite)}
                  />
                </div>
              </li>
            {/each}
          </List>
          {#if pending.code === 'email_unverified'}
            <ConfirmEmailFirst action={t('send the invite again')} />
          {:else}
            <FormError message={pending.error} />
          {/if}
        {/if}
      </Panel>

      <Panel title={t('Settings')}>
        <form class="stack narrow" onsubmit={saveName} novalidate>
          <Field label={t('Name')} id="team-rename">
            <Input bind:value={newName} maxlength={60} autocomplete="off" />
          </Field>
          <FormError message={rename.error} />
          <div>
            <SubmitButton task={rename} wide={false} variant="plain" busyLabel={t('Saving…')}
              >{t('Rename')}</SubmitButton
            >
          </div>
        </form>

        <div class="stack narrow">
          <h3>{t('Delete the team')}</h3>
          <p class="muted small">
            {t('Removes the team, its members and its invites, at once. This can’t be undone.')}
          </p>
          <div>
            <ConfirmButton
              label={t('Delete team…')}
              size="md"
              confirmLabel={t('Delete {team} for good', { team: team.name })}
              question={t('Type the team’s name to confirm.')}
              disabled={removal.busy}
              onconfirm={deleteTeam}
            >
              <label class="visually-hidden" for="delete-name">{t('Team name')}</label>
              <Input id="delete-name" bind:value={deleteTyped} autocomplete="off" />
            </ConfirmButton>
          </div>
          <FormError message={removal.error} />
        </div>
      </Panel>
    {/if}
  </div>
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .head {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
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

  /* Subsection headings: closer to what they head than to what's above. */
  .page h3 {
    margin-top: var(--space-3);
    margin-bottom: calc(var(--space-2) * -1);
  }
</style>
