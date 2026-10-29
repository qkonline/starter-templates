<!-- The devices signed in to this account: sign out one, or every other (PRD R2.4). -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type Session } from '#lib/api/index.ts';
  import { formatWhen } from '#lib/format.ts';
  import { signOut } from '#lib/session.svelte.ts';
  import { Task } from '#lib/task.svelte.ts';
  import FormError from '../FormError.svelte';
  import SubmitButton from '../SubmitButton.svelte';

  let sessions = $state<Session[] | null>(null);
  let status = $state('');
  let ending = $state<string | null>(null);
  const load = new Task();
  const end = new Task();
  const others = new Task();

  /** Read the list again, as after a password change ends other sessions. */
  export function reload() {
    load.run(async () => {
      sessions = await api.sessions();
    });
  }

  onMount(reload);

  function endOne(s: Session) {
    status = '';
    if (s.current) {
      signOut();
      return;
    }
    ending = s.id;
    end
      .run(async () => {
        await api.endSession(s.id);
        sessions = (sessions ?? []).filter((x) => x.id !== s.id);
        status = `Signed out on ${s.device}.`;
      })
      .finally(() => (ending = null));
  }

  function endOthers() {
    status = '';
    others.run(async () => {
      await api.signOutOthers();
      sessions = (sessions ?? []).filter((x) => x.current);
      status = 'Every other device is signed out.';
    });
  }

  const hasOthers = $derived((sessions ?? []).some((s) => !s.current));
</script>

<div class="stack">
  {#if sessions === null}
    {#if load.error}<FormError message={load.error} />{:else}<p class="muted">Loading…</p>{/if}
  {:else}
    <ul class="list">
      {#each sessions as s (s.id)}
        <li>
          <div>
            <p class="title">
              {s.device}
              {#if s.current}<span class="badge">This device</span>{/if}
            </p>
            <p class="muted small">
              Signed in {formatWhen(s.createdAt)} · Last used {formatWhen(s.lastUsedAt)}
            </p>
          </div>
          <button
            type="button"
            class="btn small"
            disabled={ending === s.id}
            onclick={() => endOne(s)}
            aria-label={s.current ? 'Sign out on this device' : `Sign out on ${s.device}`}>Sign out</button
          >
        </li>
      {/each}
    </ul>
  {/if}
  <FormError message={end.error || others.error} />
  <div class="row">
    {#if hasOthers}
      <SubmitButton
        task={others}
        type="button"
        wide={false}
        variant="plain"
        busyLabel="Signing out…"
        onclick={endOthers}
      >
        Sign out all other devices
      </SubmitButton>
    {/if}
    <span class="success" role="status">{status}</span>
  </div>
</div>
