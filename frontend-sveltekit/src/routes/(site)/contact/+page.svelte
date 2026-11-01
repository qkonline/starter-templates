<!--
  Contact (PRD R7.1): signed in or out. Signed out, an email address is needed so there's
  someone to answer; signed in, the message is tied to the account. Behind the CAPTCHA when the
  backend names one. Prerendered with its content; the form starts once the page has loaded.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { appName } from '#lib/config.ts';
  import { api, messageOf } from '#lib/api/index.ts';
  import { emailProblem } from '#lib/password.ts';
  import { auth, hasToken, loadMethods, loadUser } from '#lib/session.svelte.ts';
  import { Task } from '#lib/task.svelte.ts';
  import Captcha from '#lib/components/Captcha.svelte';
  import FormError from '#lib/components/FormError.svelte';
  import SubmitButton from '#lib/components/SubmitButton.svelte';
  import Field from '#lib/components/ui/Field.svelte';
  import Input from '#lib/components/ui/Input.svelte';
  import Textarea from '#lib/components/ui/Textarea.svelte';

  let ready = $state(false);
  let problem = $state('');
  let name = $state('');
  let email = $state('');
  let message = $state('');
  let sent = $state(false);
  let captcha = $state<ReturnType<typeof Captcha>>();
  const task = new Task();

  onMount(async () => {
    try {
      await Promise.all([loadMethods(), hasToken() ? loadUser().catch(() => null) : null]);
      ready = true;
    } catch (e) {
      problem = messageOf(e);
    }
  });

  const signedIn = $derived(!!auth.user);

  function send(e: SubmitEvent) {
    e.preventDefault();
    const missing =
      (!signedIn ? emailProblem(email) : null) ?? (message.trim() ? null : 'Write your message first.');
    if (missing) {
      task.error = missing;
      return;
    }
    task.run(async () => {
      const token = await captcha?.token();
      await api.contact({
        kind: 'contact',
        message: message.trim(),
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(!signedIn ? { email: email.trim() } : {}),
        ...(token ? { captcha: token } : {}),
      });
      sent = true;
    });
  }
</script>

<svelte:head><title>Contact · {appName}</title></svelte:head>

<div class="column stack">
  <h1>Contact</h1>
  {#if sent}
    <p role="status">Thank you. Your message is on its way, and we’ll answer by email.</p>
  {:else}
    <p class="muted">Questions, problems, ideas: write to us here.</p>
    <form class="stack" onsubmit={send} novalidate>
      <Field id="contact-name">
        {#snippet label()}Name <span class="muted">(optional)</span>{/snippet}
        <Input bind:value={name} maxlength={80} autocomplete="name" />
      </Field>
      {#if signedIn}
        <p class="small muted">We’ll answer at <strong>{auth.user?.email}</strong>.</p>
      {:else}
        <Field label="Email" id="contact-email">
          <Input
            type="email"
            bind:value={email}
            autocomplete="email"
            autocapitalize="off"
            spellcheck="false"
          />
        </Field>
      {/if}
      <Field label="Message" id="contact-message">
        <Textarea rows={7} maxlength={5000} bind:value={message} />
      </Field>
      {#if ready && auth.methods?.captcha}<Captcha
          bind:this={captcha}
          siteKey={auth.methods.captcha.siteKey}
          action="contact"
        />{/if}
      <FormError message={task.error || problem} />
      <div>
        <SubmitButton {task} wide={false} busyLabel="Sending…">Send message</SubmitButton>
      </div>
    </form>
  {/if}
</div>

<style>
  .column {
    max-width: 32rem;
  }
</style>
