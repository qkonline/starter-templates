<!-- Confirm the account's address with an emailed code (PRD R1.7). -->
<script lang="ts">
  import { api } from '#lib/api/index.ts';
  import { auth } from '#lib/session.svelte.ts';
  import { Task } from '#lib/task.svelte.ts';
  import { msg, t } from '#lib/i18n/index.svelte.ts';
  import Trans from '../Trans.svelte';
  import CodeInput from '../CodeInput.svelte';
  import FormError from '../FormError.svelte';
  import SubmitButton from '../SubmitButton.svelte';

  /** `sent`: a code may already be on its way (the app sends one at sign-up when it requires confirming). */
  let { sent = false }: { sent?: boolean } = $props();

  let codeSent = $state(false);
  const showCode = $derived(sent || codeSent);
  let code = $state('');
  const sendTask = new Task();
  const confirmTask = new Task();

  function send() {
    sendTask.run(async () => {
      await api.sendEmailConfirm();
      codeSent = true;
    });
  }

  function confirm(e: SubmitEvent) {
    e.preventDefault();
    confirmTask.run(async () => {
      auth.user = await api.confirmEmail(code);
    });
  }
</script>

{#if !showCode}
  <div class="stack">
    <p>
      <Trans text={msg('We’ll email a code to <b>{email}</b>.')} vars={{ email: auth.user?.email ?? '' }}>
        {#snippet b(s: string)}<strong>{s}</strong>{/snippet}
      </Trans>
    </p>
    <div>
      <SubmitButton task={sendTask} type="button" wide={false} busyLabel={t('Sending…')} onclick={send}>
        {t('Send code')}
      </SubmitButton>
    </div>
    <FormError message={sendTask.error} />
  </div>
{:else}
  <form class="stack" onsubmit={confirm} novalidate>
    <p>
      <Trans
        text={msg('Enter the code we sent to <b>{email}</b>. It works for 10 minutes.')}
        vars={{ email: auth.user?.email ?? '' }}
      >
        {#snippet b(s: string)}<strong>{s}</strong>{/snippet}
      </Trans>
    </p>
    <CodeInput id="confirm-code" bind:value={code} />
    <FormError message={confirmTask.error || sendTask.error} />
    <div class="row">
      <SubmitButton task={confirmTask} wide={false} busyLabel={t('Checking…')}
        >{t('Confirm email')}</SubmitButton
      >
      <SubmitButton
        task={sendTask}
        type="button"
        variant="plain"
        wide={false}
        busyLabel={t('Sending…')}
        onclick={send}
      >
        {t('Send a new code')}
      </SubmitButton>
    </div>
  </form>
{/if}
