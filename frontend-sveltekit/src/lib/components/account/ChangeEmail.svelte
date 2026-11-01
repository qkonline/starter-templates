<!--
  Move the account to a new address (PRD R2.2): a code goes to the new address; with a
  password, the current one is needed too, since the email salts the password key. Both keys go:
  the current one made with the old address, the new one with the new address. The CAPTCHA, when
  the backend names one, guards the sending, as on forgot password.
-->
<script lang="ts">
  import { api } from '#lib/api/index.ts';
  import { auth } from '#lib/session.svelte.ts';
  import { emailProblem, makeKey } from '#lib/password.ts';
  import { Task } from '#lib/task.svelte.ts';
  import Captcha from '../Captcha.svelte';
  import CodeInput from '../CodeInput.svelte';
  import FormError from '../FormError.svelte';
  import PasswordInput from '../PasswordInput.svelte';
  import SubmitButton from '../SubmitButton.svelte';
  import Button from '../ui/Button.svelte';
  import Field from '../ui/Field.svelte';
  import Input from '../ui/Input.svelte';

  let { onDone }: { onDone?: () => void } = $props();

  let email = $state('');
  let sentTo = $state<string | null>(null);
  let code = $state('');
  let password = $state('');
  let done = $state(false);
  let captcha = $state<ReturnType<typeof Captcha>>();
  const sendTask = new Task();
  const verifyTask = new Task();

  function send(e?: SubmitEvent) {
    e?.preventDefault();
    done = false;
    const problem = emailProblem(email);
    if (problem) {
      sendTask.error = problem;
      return;
    }
    sendTask.run(async () => {
      await api.sendEmailChange(email.trim(), await captcha?.token());
      sentTo = email.trim();
    });
  }

  function verify(e: SubmitEvent) {
    e.preventDefault();
    const user = auth.user;
    const methods = auth.methods;
    if (!user || !methods || !sentTo) return;
    if (user.hasPassword && !password) {
      verifyTask.error = 'Enter your password.';
      return;
    }
    const to = sentTo;
    verifyTask.run(async () => {
      const keys = user.hasPassword
        ? await Promise.all([
            makeKey(password, user.email, methods.password),
            makeKey(password, to, methods.password),
          ])
        : null;
      auth.user = await api.verifyEmailChange({
        email: to,
        code,
        ...(keys ? { currentPasswordKey: keys[0], passwordKey: keys[1] } : {}),
      });
      email = code = password = '';
      sentTo = null;
      done = true;
      onDone?.();
    });
  }
</script>

{#if !sentTo}
  <form class="stack" onsubmit={send} novalidate>
    <Field label="New email address" id="new-email" invalid={!!sendTask.error} describedby="new-email-error">
      <Input
        type="email"
        bind:value={email}
        autocomplete="email"
        autocapitalize="off"
        spellcheck="false"
        required
      />
    </Field>
    {#if auth.methods?.captcha}<Captcha
        bind:this={captcha}
        siteKey={auth.methods.captcha.siteKey}
        action="email-change"
      />{/if}
    <FormError id="new-email-error" message={sendTask.error} />
    <div class="row">
      <SubmitButton task={sendTask} wide={false} busyLabel="Sending…">Send code to new address</SubmitButton>
      <span class="success" role="status">{done ? 'Your email address is changed.' : ''}</span>
    </div>
  </form>
{:else}
  <form class="stack" onsubmit={verify} novalidate>
    <p>Enter the code we sent to <strong>{sentTo}</strong>.</p>
    <CodeInput id="change-code" bind:value={code} />
    {#if auth.user?.hasPassword}
      <PasswordInput
        id="change-password"
        bind:value={password}
        label="Your password"
        hint="Your password stays the same; it’s needed because your email is part of how it’s protected."
      />
    {/if}
    <FormError message={verifyTask.error || sendTask.error} />
    <div class="row">
      <SubmitButton task={verifyTask} wide={false} busyLabel="Checking…">Change email</SubmitButton>
      <Button
        type="button"
        onclick={() => {
          sentTo = null;
          verifyTask.clear();
        }}>Use another address</Button
      >
    </div>
  </form>
{/if}
