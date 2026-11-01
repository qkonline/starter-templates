<!-- Teams (PRD R5.1, R5.2): the person's teams, invites waiting for them, and making a new team. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { ApiError, api, type ReceivedInvite, type TeamSummary } from '#lib/api/index.ts';
  import { appName } from '#lib/config.ts';
  import { auth } from '#lib/session.svelte.ts';
  import { Task } from '#lib/task.svelte.ts';
  import { asRole, expiresIn, inviteGone, roleLabel, teamPath } from '#lib/teams.ts';
  import FormError from '#lib/components/FormError.svelte';
  import SubmitButton from '#lib/components/SubmitButton.svelte';
  import Button from '#lib/components/ui/Button.svelte';
  import Field from '#lib/components/ui/Field.svelte';
  import Input from '#lib/components/ui/Input.svelte';
  import List from '#lib/components/ui/List.svelte';
  import Panel from '#lib/components/ui/Panel.svelte';
  import { t, tn } from '#lib/i18n/index.svelte.ts';

  const base = resolve('').replace(/\/$/, '');
  let teams = $state<TeamSummary[] | null>(null);
  let invites = $state<ReceivedInvite[]>([]);
  let name = $state('');
  let answering = $state<string | null>(null);
  const load = new Task();
  const create = new Task();
  const answer = new Task();

  onMount(() => {
    if (!auth.features?.teams) return;
    load.run(async () => {
      [teams, invites] = await Promise.all([api.teams(), api.myInvites()]);
    });
  });

  function make(e: SubmitEvent) {
    e.preventDefault();
    if (!name.trim()) {
      create.error = t('Give the team a name.');
      return;
    }
    create.run(async () => {
      const team = await api.createTeam(name);
      await goto(teamPath(team.id, base));
    });
  }

  function accept(invite: ReceivedInvite) {
    answering = invite.id;
    answer
      .run(async () => {
        try {
          const team = await api.acceptInvite({ inviteId: invite.id });
          await goto(teamPath(team.id, base));
        } catch (e) {
          if (e instanceof ApiError && e.code === 'not_found') {
            invites = invites.filter((i) => i.id !== invite.id);
            throw new Error(inviteGone(undefined), { cause: e });
          }
          throw e;
        }
      })
      .finally(() => (answering = null));
  }

  function decline(invite: ReceivedInvite) {
    answering = invite.id;
    answer
      .run(async () => {
        await api.declineInvite(invite.id);
        invites = invites.filter((i) => i.id !== invite.id);
      })
      .finally(() => (answering = null));
  }
</script>

<svelte:head><title>{t('Teams')} · {appName}</title></svelte:head>

{#if !auth.features?.teams}
  <p class="muted">{t('Teams aren’t switched on in this app.')}</p>
{:else}
  <div class="stack page">
    <h1>{t('Teams')}</h1>

    {#if invites.length}
      <Panel title={t('Invites for you')}>
        <List>
          {#each invites as invite (invite.id)}
            <li>
              <div>
                <p class="title">{invite.team.name}</p>
                <p class="muted small">
                  {t('From {name}, as {role} · {expires}', {
                    name: invite.invitedBy.name ?? invite.invitedBy.email,
                    role: roleLabel(invite.role).toLowerCase(),
                    expires: expiresIn(invite.expiresAt),
                  })}
                </p>
              </div>
              <div class="row">
                <Button
                  type="button"
                  variant="primary"
                  size="small"
                  disabled={answering === invite.id}
                  onclick={() => accept(invite)}>{t('Join')}</Button
                >
                <Button
                  type="button"
                  size="small"
                  disabled={answering === invite.id}
                  onclick={() => decline(invite)}>{t('Decline')}</Button
                >
              </div>
            </li>
          {/each}
        </List>
        <FormError message={answer.error} />
      </Panel>
    {/if}

    <Panel title={t('Your teams')}>
      {#if teams === null}
        {#if load.error}<FormError message={load.error} />{:else}<p class="muted">{t('Loading…')}</p>{/if}
      {:else if teams.length === 0}
        <p class="muted">{t('You’re not in a team yet. Make one below, or join one from an invite.')}</p>
      {:else}
        <List>
          {#each teams as team (team.id)}
            <li>
              <div>
                <p class="title"><a href={teamPath(team.id, base)}>{team.name}</a></p>
                <p class="muted small">
                  {tn(team.memberCount, '1 member', '{count} members')} · {t('You’re {role}', {
                    role: asRole(team.role),
                  })}
                </p>
              </div>
            </li>
          {/each}
        </List>
      {/if}
      {#if !auth.user?.emailVerified}
        <p class="muted small">
          {t('Invites sent to {email} show here once you’ve confirmed the address.', {
            email: auth.user?.email ?? '',
          })}
          <a href="{resolve('account')}#email">{t('Confirm it')}</a>
        </p>
      {/if}
    </Panel>

    <Panel title={t('New team')}>
      <form class="stack narrow" onsubmit={make} novalidate>
        <Field label={t('Name')} id="team-name">
          <Input bind:value={name} maxlength={60} autocomplete="off" />
        </Field>
        <FormError message={create.error} />
        <div>
          <SubmitButton task={create} wide={false} busyLabel={t('Making…')}>{t('Make the team')}</SubmitButton
          >
        </div>
      </form>
    </Panel>
  </div>
{/if}

<style>
  .page {
    gap: var(--space-5);
  }

  .narrow {
    max-width: var(--form-width);
  }
</style>
