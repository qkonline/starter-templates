<!--
  "Send feedback" from inside the app (PRD R7.1): a message, sent with the page the person was
  on. Behind the CAPTCHA when the app has one.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { api } from '#lib/api/index.ts';
  import { auth } from '#lib/session.svelte.ts';
  import { Task } from '#lib/task.svelte.ts';
  import Captcha from './Captcha.svelte';
  import FormError from './FormError.svelte';
  import SubmitButton from './SubmitButton.svelte';

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
      task.error = 'Write a few words first.';
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
      <h2 id="feedback-h">Thank you</h2>
      <p>Your feedback is on its way.</p>
      <div><button type="button" class="btn" onclick={close}>Close</button></div>
    </div>
  {:else}
    <form class="stack" onsubmit={send} novalidate>
      <h2 id="feedback-h">Send feedback</h2>
      <div class="field">
        <label for="feedback-message">What’s on your mind?</label>
        <textarea id="feedback-message" class="input" rows="5" maxlength="5000" bind:value={message}
        ></textarea>
        <p class="hint">Sent with the page you’re on, so we know what you mean.</p>
      </div>
      {#if open && auth.methods?.captcha}<Captcha
          bind:this={captcha}
          siteKey={auth.methods.captcha.siteKey}
          action="feedback"
        />{/if}
      <FormError message={task.error} />
      <div class="row">
        <SubmitButton {task} wide={false} busyLabel="Sending…">Send</SubmitButton>
        <button type="button" class="btn" onclick={close}>Cancel</button>
      </div>
    </form>
  {/if}
</dialog>

<style>
  textarea {
    min-height: 7rem;
    padding: var(--space-2) var(--space-3);
    resize: vertical;
  }
</style>
