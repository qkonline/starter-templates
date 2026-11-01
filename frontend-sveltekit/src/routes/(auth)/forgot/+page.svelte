<!--
  Forgot password (PRD R1.3): a code by email, then the code and a new password, which signs in.
  The reply is the same whether or not the address has an account.
-->
<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { api } from '#lib/api/index.ts';
  import { emailProblem, makeKey, passwordProblem } from '#lib/password.ts';
  import { auth, signedIn } from '#lib/session.svelte.ts';
  import { Task } from '#lib/task.svelte.ts';
  import AuthShell from '#lib/components/AuthShell.svelte';
  import Captcha from '#lib/components/Captcha.svelte';
  import CodeInput from '#lib/components/CodeInput.svelte';
  import FormError from '#lib/components/FormError.svelte';
  import PasswordInput from '#lib/components/PasswordInput.svelte';
  import SubmitButton from '#lib/components/SubmitButton.svelte';
  import Button from '#lib/components/ui/Button.svelte';
  import Field from '#lib/components/ui/Field.svelte';
  import Input from '#lib/components/ui/Input.svelte';

  const methods = $derived(auth.methods!);

  let email = $state(page.url.searchParams.get('email') ?? '');
  let sentTo = $state<string | null>(null);
  let code = $state('');
  let password = $state('');
  let captcha = $state<ReturnType<typeof Captcha>>();
  const sendTask = new Task();
  const resetTask = new Task();

  function send(e: SubmitEvent) {
    e.preventDefault();
    const problem = emailProblem(email);
    if (problem) {
      sendTask.error = problem;
      return;
    }
    sendTask.run(async () => {
      await api.forgotPassword(email.trim(), await captcha?.token());
      sentTo = email.trim();
    });
  }

  function reset(e: SubmitEvent) {
    e.preventDefault();
    if (!sentTo) return;
    const problem =
      (code.trim() ? null : 'Enter the code from the email.') ??
      passwordProblem(password, methods.password.minLength);
    if (problem) {
      resetTask.error = problem;
      return;
    }
    const to = sentTo;
    resetTask.run(async () => {
      const key = await makeKey(password, to, methods.password);
      await signedIn(await api.resetPassword(to, code, key));
    });
  }
</script>

{#if !sentTo}
  <AuthShell title="Reset your password" lead="We’ll email you a code to set a new one.">
    <form class="stack" onsubmit={send} novalidate>
      <Field label="Email" id="email">
        <Input
          type="email"
          bind:value={email}
          autocomplete="email"
          autocapitalize="off"
          spellcheck="false"
          required
        />
      </Field>
      {#if methods.captcha}<Captcha
          bind:this={captcha}
          siteKey={methods.captcha.siteKey}
          action="forgot"
        />{/if}
      <FormError message={sendTask.error} />
      <SubmitButton task={sendTask} busyLabel="Sending…">Email me a code</SubmitButton>
    </form>
    <p class="muted"><a href={resolve('signin')}>Back to sign in</a></p>
  </AuthShell>
{:else}
  <AuthShell
    title="Check your email"
    lead="If {sentTo} has an account, a code is on its way. It works for 10 minutes."
  >
    <form class="stack" onsubmit={reset} novalidate>
      <CodeInput id="code" bind:value={code} />
      <PasswordInput
        id="password"
        bind:value={password}
        label="New password"
        autocomplete="new-password"
        hint="At least {methods.password.minLength} characters. Other devices will be signed out."
      />
      <!-- For password managers: the account this password belongs to. -->
      <input
        type="email"
        class="visually-hidden"
        value={sentTo}
        autocomplete="username"
        readonly
        tabindex="-1"
        aria-hidden="true"
      />
      <FormError message={resetTask.error} />
      <SubmitButton task={resetTask} busyLabel="Setting your password…">Set password and sign in</SubmitButton
      >
    </form>
    <p class="muted">
      No email? Check spam, or <Button type="button" variant="link" onclick={() => (sentTo = null)}
        >send another code</Button
      >.
    </p>
  </AuthShell>
{/if}
