<!-- Download everything stored about the person (PRD R2.5); delete the account (PRD R2.6). -->
<script lang="ts">
  import { api } from '#lib/api/index.ts';
  import { appName } from '#lib/config.ts';
  import { downloadJson, exportFileName } from '#lib/format.ts';
  import { accountDeleted, auth } from '#lib/session.svelte.ts';
  import { Task } from '#lib/task.svelte.ts';
  import { msg, t } from '#lib/i18n/index.svelte.ts';
  import Trans from '../Trans.svelte';
  import FormError from '../FormError.svelte';
  import SubmitButton from '../SubmitButton.svelte';
  import Button from '../ui/Button.svelte';
  import Field from '../ui/Field.svelte';
  import Input from '../ui/Input.svelte';

  const exportTask = new Task();
  const deleteTask = new Task();
  let confirming = $state(false);
  let typed = $state('');

  function download() {
    exportTask.run(async () => {
      downloadJson(await api.exportData(), exportFileName(appName));
    });
  }

  function remove(e: SubmitEvent) {
    e.preventDefault();
    if (typed.trim().toLowerCase() !== auth.user?.email) {
      deleteTask.error = t('Type your email address exactly as shown to confirm.');
      return;
    }
    deleteTask.run(async () => {
      await api.deleteAccount();
      await accountDeleted();
    });
  }
</script>

<div class="stack">
  <div class="stack">
    <h3>{t('Your data')}</h3>
    <p class="muted">{t('Everything {appName} stores about you, as a JSON file.', { appName })}</p>
    <div>
      <SubmitButton
        task={exportTask}
        type="button"
        variant="plain"
        wide={false}
        busyLabel={t('Preparing…')}
        onclick={download}
      >
        {t('Download my data')}
      </SubmitButton>
    </div>
    <FormError message={exportTask.error} />
  </div>

  <div class="stack">
    <h3>{t('Delete account')}</h3>
    <p class="muted">
      {t(
        'Removes your account, your photo, your passkeys and every signed-in device, at once. This can’t be undone.',
      )}
    </p>
    {#if !confirming}
      <div>
        <Button type="button" variant="danger" onclick={() => (confirming = true)}
          >{t('Delete my account…')}</Button
        >
      </div>
    {:else}
      <form class="stack confirm" onsubmit={remove} novalidate>
        <Field id="delete-confirm">
          {#snippet label()}<Trans
              text={msg('To confirm, type <b>{email}</b>')}
              vars={{ email: auth.user?.email ?? '' }}
            >
              {#snippet b(s: string)}<strong>{s}</strong>{/snippet}
            </Trans>{/snippet}
          <Input bind:value={typed} autocomplete="off" autocapitalize="off" spellcheck="false" />
        </Field>
        <FormError message={deleteTask.error} />
        <div class="row">
          <SubmitButton task={deleteTask} variant="danger" wide={false} busyLabel={t('Deleting…')}>
            {t('Delete my account for good')}
          </SubmitButton>
          <Button
            type="button"
            onclick={() => {
              confirming = false;
              typed = '';
              deleteTask.clear();
            }}>{t('Cancel')}</Button
          >
        </div>
      </form>
    {/if}
  </div>
</div>

<style>
  .confirm {
    padding: var(--space-4);
    border: 1px solid var(--color-danger);
    border-radius: var(--radius-sm);
    background: var(--color-danger-soft);
  }
</style>
