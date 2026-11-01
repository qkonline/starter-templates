<!-- Download everything stored about the person (PRD R2.5); delete the account (PRD R2.6). -->
<script lang="ts">
  import { api } from '#lib/api/index.ts';
  import { appName } from '#lib/config.ts';
  import { downloadJson, exportFileName } from '#lib/format.ts';
  import { accountDeleted, auth } from '#lib/session.svelte.ts';
  import { Task } from '#lib/task.svelte.ts';
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
      deleteTask.error = 'Type your email address exactly as shown to confirm.';
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
    <h3>Your data</h3>
    <p class="muted">Everything {appName} stores about you, as a JSON file.</p>
    <div>
      <SubmitButton
        task={exportTask}
        type="button"
        variant="plain"
        wide={false}
        busyLabel="Preparing…"
        onclick={download}
      >
        Download my data
      </SubmitButton>
    </div>
    <FormError message={exportTask.error} />
  </div>

  <div class="stack">
    <h3>Delete account</h3>
    <p class="muted">
      Removes your account, your photo, your passkeys and every signed-in device, at once. This can’t be
      undone.
    </p>
    {#if !confirming}
      <div>
        <Button type="button" variant="danger" onclick={() => (confirming = true)}>Delete my account…</Button>
      </div>
    {:else}
      <form class="stack confirm" onsubmit={remove} novalidate>
        <Field id="delete-confirm">
          {#snippet label()}To confirm, type <strong>{auth.user?.email}</strong>{/snippet}
          <Input bind:value={typed} autocomplete="off" autocapitalize="off" spellcheck="false" />
        </Field>
        <FormError message={deleteTask.error} />
        <div class="row">
          <SubmitButton task={deleteTask} variant="danger" wide={false} busyLabel="Deleting…">
            Delete my account for good
          </SubmitButton>
          <Button
            type="button"
            onclick={() => {
              confirming = false;
              typed = '';
              deleteTask.clear();
            }}>Cancel</Button
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
