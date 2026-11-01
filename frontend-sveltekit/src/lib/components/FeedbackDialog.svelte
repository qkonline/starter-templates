<!--
  "Send feedback" from inside the app (PRD R7.1): a message, sent with the page the person was
  on. Behind the CAPTCHA when the app has one.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { api } from '#lib/api/index.ts';
  import { auth } from '#lib/session.svelte.ts';
  import { Task } from '#lib/task.svelte.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
  import Captcha from './Captcha.svelte';
  import FormError from './FormError.svelte';
  import SubmitButton from './SubmitButton.svelte';
  import Button from './ui/Button.svelte';
  import Field from './ui/Field.svelte';
  import Textarea from './ui/Textarea.svelte';

  let dialog = $state<HTMLDialogElement>();
  let captcha = $state<ReturnType<typeof Captcha>>();
  let message = $state('');
  let sent = $state(false);
  let open = $state(false);
  const task = new Task();

  export function show() {
    sent = false;
    task.clear();
    open = true;
    dialog?.showModal();
  }

  function close() {
    dialog?.close();
  }

  function send(e: SubmitEvent) {
    e.preventDefault();
    if (!message.trim()) {
      task.error = t('Write a few words first.');
      return;
    }
    task.run(async () => {
      await api.contact({
        kind: 'feedback',
        message: message.trim(),
        page: page.url.pathname,
        ...(await captchaToken()),
      });
      message = '';
      sent = true;
    });
  }

  async function captchaToken() {
    const token = await captcha?.token();
    return token ? { captcha: token } : {};
  }
</script>

<dialog bind:this={dialog} class="pop" aria-labelledby="feedback-h" onclose={() => (open = false)}>
  {#if sent}
    <div class="stack">
      <h2 id="feedback-h">{t('Thank you')}</h2>
      <p>{t('Your feedback is on its way.')}</p>
      <div><Button type="button" onclick={close}>{t('Close')}</Button></div>
    </div>
  {:else}
    <form class="stack" onsubmit={send} novalidate>
      <h2 id="feedback-h">{t('Send feedback')}</h2>
      <Field
        label={t('What’s on your mind?')}
        hint={t('Sent with the page you’re on, so we know what you mean.')}
      >
        <Textarea class="message" rows={5} maxlength={5000} bind:value={message} />
      </Field>
      {#if open && auth.methods?.captcha}<Captcha
          bind:this={captcha}
          siteKey={auth.methods.captcha.siteKey}
          action="feedback"
        />{/if}
      <FormError message={task.error} />
      <div class="row">
        <SubmitButton {task} wide={false} busyLabel={t('Sending…')}>{t('Send')}</SubmitButton>
        <Button type="button" onclick={close}>{t('Cancel')}</Button>
      </div>
    </form>
  {/if}
</dialog>

<style>
  dialog :global(.message) {
    min-height: 7rem;
  }
</style>
