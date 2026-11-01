<!-- The devices signed in to this account: sign out one, or every other (PRD R2.4). -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type Session } from '#lib/api/index.ts';
  import { formatWhen } from '#lib/format.ts';
  import { signOut } from '#lib/session.svelte.ts';
  import { Task } from '#lib/task.svelte.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
  import FormError from '../FormError.svelte';
  import SubmitButton from '../SubmitButton.svelte';
  import Badge from '../ui/Badge.svelte';
  import Button from '../ui/Button.svelte';
  import List from '../ui/List.svelte';

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
        status = t('Signed out on {device}.', { device: s.device });
      })
      .finally(() => (ending = null));
  }

  function endOthers() {
    status = '';
    others.run(async () => {
      await api.signOutOthers();
      sessions = (sessions ?? []).filter((x) => x.current);
      status = t('Every other device is signed out.');
    });
  }

  const hasOthers = $derived((sessions ?? []).some((s) => !s.current));
</script>

<div class="stack">
  {#if sessions === null}
    {#if load.error}<FormError message={load.error} />{:else}<p class="muted">{t('Loading…')}</p>{/if}
  {:else}
    <List>
      {#each sessions as s (s.id)}
        <li>
          <div>
            <p class="title">
              {s.device}
              {#if s.current}<Badge>{t('This device')}</Badge>{/if}
            </p>
            <p class="muted small">
              {t('Signed in {signedIn} · Last used {lastUsed}', {
                signedIn: formatWhen(s.createdAt),
                lastUsed: formatWhen(s.lastUsedAt),
              })}
            </p>
          </div>
          <Button
            type="button"
            size="small"
            disabled={ending === s.id}
            onclick={() => endOne(s)}
            aria-label={s.current
              ? t('Sign out on this device')
              : t('Sign out on {device}', { device: s.device })}>{t('Sign out')}</Button
          >
        </li>
      {/each}
    </List>
  {/if}
  <FormError message={end.error || others.error} />
  <div class="row">
    {#if hasOthers}
      <SubmitButton
        task={others}
        type="button"
        wide={false}
        variant="plain"
        busyLabel={t('Signing out…')}
        onclick={endOthers}
      >
        {t('Sign out all other devices')}
      </SubmitButton>
    {/if}
    <span class="success" role="status">{status}</span>
  </div>
</div>
