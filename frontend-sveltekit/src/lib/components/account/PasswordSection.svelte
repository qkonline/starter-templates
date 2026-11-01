<!--
  Change the password, knowing the current one (PRD R2.7). An account without one (made with
  Google or a code) sets its first by an emailed code, as forgot password does.
-->
<script lang="ts">
  import { api } from '#lib/api/index.ts';
  import { auth, replaceSession } from '#lib/session.svelte.ts';
  import { makeKey, makeKeys, passwordProblem } from '#lib/password.ts';
  import { Task } from '#lib/task.svelte.ts';
  import { msg, t } from '#lib/i18n/index.svelte.ts';
  import Trans from '../Trans.svelte';
  import Captcha from '../Captcha.svelte';
  import CodeInput from '../CodeInput.svelte';
  import FormError from '../FormError.svelte';
  import PasswordInput from '../PasswordInput.svelte';
  import SubmitButton from '../SubmitButton.svelte';
  import Button from '../ui/Button.svelte';

  let { onChanged }: { onChanged?: () => void } = $props();

  const methods = $derived(auth.methods!);
  const user = $derived(auth.user!);

  let current = $state('');
  let next = $state('');
  let code = $state('');
  let codeSent = $state(false);
  let done = $state('');
  let captcha = $state<ReturnType<typeof Captcha>>();
  const task = new Task();
  const sendTask = new Task();

  function change(e: SubmitEvent) {
    e.preventDefault();
    done = '';
    const problem = !current
      ? t('Enter your current password.')
      : passwordProblem(next, methods.password.minLength);
    if (problem) {
      task.error = problem;
      return;
    }
    task.run(async () => {
      const [currentKeys, newKey] = await Promise.all([
        makeKeys(current, user.email, methods.password),
        makeKey(next, user.email, methods.password),
      ]);
      await api.changePassword(currentKeys.key, newKey, currentKeys.previous);
      current = next = '';
      done = t('Password changed. Other devices are signed out.');
      onChanged?.();
    });
  }

  function sendCode() {
    done = '';
    sendTask.run(async () => {
      await api.forgotPassword(user.email, await captcha?.token());
      codeSent = true;
    });
  }

  function setFirst(e: SubmitEvent) {
    e.preventDefault();
    const problem = passwordProblem(next, methods.password.minLength);
    if (problem) {
      task.error = problem;
      return;
    }
    task.run(async () => {
      const key = await makeKey(next, user.email, methods.password);
      await replaceSession(await api.resetPassword(user.email, code, key));
      next = code = '';
      codeSent = false;
      done = t('Password set. Other devices are signed out.');
      onChanged?.();
    });
  }
</script>

{#if user.hasPassword}
  <form class="stack" onsubmit={change} novalidate>
    <PasswordInput id="current-password" bind:value={current} label={t('Current password')} />
    <PasswordInput
      id="new-password"
      bind:value={next}
      label={t('New password')}
      autocomplete="new-password"
      hint={t('At least {minLength} characters. Other devices will be signed out.', {
        minLength: methods.password.minLength,
      })}
    />
    <FormError message={task.error} />
    <div class="row">
      <SubmitButton {task} wide={false} busyLabel={t('Changing…')}>{t('Change password')}</SubmitButton>
      <span class="success" role="status">{done}</span>
    </div>
  </form>
{:else if !codeSent}
  <div class="stack">
    <p>
      <Trans
        text={msg('You sign in without a password. To set one, we’ll email a code to <b>{email}</b>.')}
        vars={{ email: user.email }}
      >
        {#snippet b(s: string)}<strong>{s}</strong>{/snippet}
      </Trans>
    </p>
    {#if methods.captcha}<Captcha
        bind:this={captcha}
        siteKey={methods.captcha.siteKey}
        action="set-password"
      />{/if}
    <FormError message={sendTask.error} />
    <div class="row">
      <SubmitButton task={sendTask} type="button" wide={false} busyLabel={t('Sending…')} onclick={sendCode}>
        {t('Email me a code')}
      </SubmitButton>
      <span class="success" role="status">{done}</span>
    </div>
  </div>
{:else}
  <form class="stack" onsubmit={setFirst} novalidate>
    <p>
      <Trans
        text={msg('Enter the code we sent to <b>{email}</b>, and your new password.')}
        vars={{ email: user.email }}
      >
        {#snippet b(s: string)}<strong>{s}</strong>{/snippet}
      </Trans>
    </p>
    <CodeInput id="set-code" bind:value={code} />
    <PasswordInput
      id="first-password"
      bind:value={next}
      label={t('New password')}
      autocomplete="new-password"
      hint={t('At least {minLength} characters.', { minLength: methods.password.minLength })}
    />
    <FormError message={task.error} />
    <div class="row">
      <SubmitButton {task} wide={false} busyLabel={t('Setting…')}>{t('Set password')}</SubmitButton>
      <Button type="button" onclick={() => (codeSent = false)}>{t('Back')}</Button>
    </div>
  </form>
{/if}
