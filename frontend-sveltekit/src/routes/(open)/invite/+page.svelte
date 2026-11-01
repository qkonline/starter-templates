<!--
  The emailed invite link, `/invite?token=…` (PRD R5.2). Signed out: sign in or create an account
  first, then come back here. Signed in: say which account will join, and join on a tap (the
  link proves the address, so it also confirms the email).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { ApiError, api, messageOf } from '#lib/api/index.ts';
  import { auth, loadFeatures, loadMethods, loadUser, signOut } from '#lib/session.svelte.ts';
  import { Task } from '#lib/task.svelte.ts';
  import { authPathFor, inviteGone, inviteToken, teamPath } from '#lib/teams.ts';
  import AuthShell from '#lib/components/AuthShell.svelte';
  import FormError from '#lib/components/FormError.svelte';
  import Spinner from '#lib/components/Spinner.svelte';
  import SubmitButton from '#lib/components/SubmitButton.svelte';
  import Button from '#lib/components/ui/Button.svelte';

  // Derived, so following another invite link from this page shows that invite.
  const token = $derived(inviteToken(page.url));
  const base = resolve('').replace(/\/$/, '');
  let phase = $state<'loading' | 'ready' | 'failed'>('loading');
  let problem = $state('');
  const task = new Task();

  onMount(async () => {
    try {
      const [, features] = await Promise.all([loadMethods(), loadFeatures(), loadUser()]);
      if (!features.teams) problem = 'Teams aren’t switched on in this app.';
      phase = 'ready';
    } catch (e) {
      problem = messageOf(e);
      phase = 'failed';
    }
  });

  function join() {
    const t = token;
    if (!t) return;
    task.run(async () => {
      try {
        const team = await api.acceptInvite({ token: t });
        await loadUser();
        await goto(teamPath(team.id, base), { replace: true });
      } catch (e) {
        if (e instanceof ApiError && e.code === 'not_found')
          throw new Error(inviteGone(auth.user?.email), { cause: e });
        throw e;
      }
    });
  }
</script>

{#if phase === 'loading'}
  <div class="loading" role="status"><Spinner /><span class="visually-hidden">Loading</span></div>
{:else if !token}
  <AuthShell title="This invite link is incomplete">
    <p>Open the link from the email again, or ask for a new invite.</p>
  </AuthShell>
{:else if problem}
  <AuthShell title="Can’t open this invite">
    <p role="alert">{problem}</p>
    <div><Button href={resolve('')}>Go to the home page</Button></div>
  </AuthShell>
{:else if !auth.user}
  <AuthShell title="You’re invited to a team" lead="Sign in or create an account to join it.">
    <p class="muted">Use the email address the invite was sent to.</p>
    <div class="stack">
      <Button variant="primary" wide href={authPathFor('signin', token, base)}>Sign in</Button>
      <Button wide href={authPathFor('signup', token, base)}>Create an account</Button>
    </div>
  </AuthShell>
{:else}
  <AuthShell title="You’re invited to a team">
    <p>You’ll join as <strong>{auth.user.email}</strong>.</p>
    <FormError message={task.error} />
    <SubmitButton {task} type="button" busyLabel="Joining…" onclick={join}>Join the team</SubmitButton>
    <p class="muted small">
      Not you? <Button type="button" variant="link" onclick={signOut}>Sign out</Button> and sign in with the invited
      address.
    </p>
  </AuthShell>
{/if}

<style>
  .loading {
    min-height: 60dvh;
    display: grid;
    place-items: center;
    color: var(--color-muted);
  }
</style>
