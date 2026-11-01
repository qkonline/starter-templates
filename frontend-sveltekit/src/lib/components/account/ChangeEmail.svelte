<!--
  Move the account to a new address (PRD R2.2): a code goes to the new address; with a
  password, the current one is needed too, since the email salts the password key. Both keys go:
  the current one made with the old address, the new one with the new address. Without a
  password, a second code goes to the current address, so a session alone can't move the account. The CAPTCHA, when
  the backend names one, guards the sending, as on forgot password.
-->
<script lang="ts">
  import { api } from '#lib/api/index.ts';
  import { auth } from '#lib/session.svelte.ts';
  import { emailProblem, makeKey, makeKeys } from '#lib/password.ts';
  import { Task } from '#lib/task.svelte.ts';
  import { msg, t } from '#lib/i18n/index.svelte.ts';
  import Trans from '../Trans.svelte';
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
  let currentCode = $state('');
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
      verifyTask.error = t('Enter your password.');
      return;
    }
    if (!user.hasPassword && !currentCode.trim()) {
      verifyTask.error = t('Enter the code we sent to {email} as well.', { email: user.email });
      return;
    }
    const to = sentTo;
    verifyTask.run(async () => {
      const keys = user.hasPassword
        ? await Promise.all([
            makeKeys(password, user.email, methods.password),
            makeKey(password, to, methods.password),
          ])
        : null;
      auth.user = await api.verifyEmailChange({
        email: to,
        code,
        ...(keys
          ? {
              currentPasswordKey: keys[0].key,
              passwordKey: keys[1],
              ...(keys[0].previous ? { previousCurrentPasswordKey: keys[0].previous } : {}),
            }
          : { currentCode }),
      });
      email = code = currentCode = password = '';
      sentTo = null;
      done = true;
      onDone?.();
    });
  }
</script>

{#if !sentTo}
  <form class="stack" onsubmit={send} novalidate>
    <Field
      label={t('New email address')}
      id="new-email"
      invalid={!!sendTask.error}
      describedby="new-email-error"
    >
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
      <SubmitButton task={sendTask} wide={false} busyLabel={t('Sending…')}
        >{t('Send code to new address')}</SubmitButton
      >
      <span class="success" role="status">{done ? t('Your email address is changed.') : ''}</span>
    </div>
  </form>
{:else}
  <form class="stack" onsubmit={verify} novalidate>
    <p>
      <Trans text={msg('Enter the code we sent to <b>{email}</b>.')} vars={{ email: sentTo }}>
        {#snippet b(s: string)}<strong>{s}</strong>{/snippet}
      </Trans>
    </p>
    <CodeInput id="change-code" bind:value={code} />
    {#if auth.user && !auth.user.hasPassword}
      <p>
        <Trans
          text={msg('And the code we sent to your current address, <b>{email}</b>.')}
          vars={{ email: auth.user.email }}
        >
          {#snippet b(s: string)}<strong>{s}</strong>{/snippet}
        </Trans>
      </p>
      <CodeInput
        id="change-current-code"
        label={t('Code from your current address')}
        bind:value={currentCode}
      />
    {/if}
    {#if auth.user?.hasPassword}
      <PasswordInput
        id="change-password"
        bind:value={password}
        label={t('Your password')}
        hint={t(
          'Your password stays the same; it’s needed because your email is part of how it’s protected.',
        )}
      />
    {/if}
    <FormError message={verifyTask.error || sendTask.error} />
    <div class="row">
      <SubmitButton task={verifyTask} wide={false} busyLabel={t('Checking…')}
        >{t('Change email')}</SubmitButton
      >
      <Button
        type="button"
        onclick={() => {
          sentTo = null;
          verifyTask.clear();
        }}>{t('Use another address')}</Button
      >
    </div>
  </form>
{/if}
