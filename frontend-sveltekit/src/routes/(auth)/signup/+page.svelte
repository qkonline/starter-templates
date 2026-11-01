<!-- Make an account with email and password, signed in at once (PRD R1.1, R1.2). -->
<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { api } from '#lib/api/index.ts';
  import { emailProblem, makeKey, passwordProblem } from '#lib/password.ts';
  import { auth, signedIn } from '#lib/session.svelte.ts';
  import { t, tn } from '#lib/i18n/index.svelte.ts';
  import { Task } from '#lib/task.svelte.ts';
  import AuthShell from '#lib/components/AuthShell.svelte';
  import Captcha from '#lib/components/Captcha.svelte';
  import FormError from '#lib/components/FormError.svelte';
  import PasswordInput from '#lib/components/PasswordInput.svelte';
  import SubmitButton from '#lib/components/SubmitButton.svelte';
  import Field from '#lib/components/ui/Field.svelte';
  import Input from '#lib/components/ui/Input.svelte';
  import Trans from '#lib/components/Trans.svelte';

  const methods = $derived(auth.methods!);
  // Derived, so a link to this page with another `next` is followed.
  const next = $derived(page.url.searchParams.get('next'));

  let email = $state('');
  let password = $state('');
  let captcha = $state<ReturnType<typeof Captcha>>();
  const task = new Task();

  function submit(e: SubmitEvent) {
    e.preventDefault();
    const problem = emailProblem(email) ?? passwordProblem(password, methods.password.minLength);
    if (problem) {
      task.error = problem;
      return;
    }
    task.run(async () => {
      const [key, token] = await Promise.all([makeKey(password, email, methods.password), captcha?.token()]);
      await signedIn(await api.signUp(email.trim(), key, token), next);
    });
  }
</script>

<AuthShell title={t('Create your account')}>
  <form class="stack" onsubmit={submit} novalidate>
    <Field label={t('Email')} id="email">
      <Input
        type="email"
        bind:value={email}
        autocomplete="email"
        autocapitalize="off"
        spellcheck="false"
        required
      />
    </Field>
    <PasswordInput
      id="password"
      bind:value={password}
      autocomplete="new-password"
      hint={tn(
        methods.password.minLength,
        'At least 1 character. It never leaves this device: we only get a key made from it.',
        'At least {count} characters. It never leaves this device: we only get a key made from it.',
      )}
    />
    {#if methods.captcha}<Captcha
        bind:this={captcha}
        siteKey={methods.captcha.siteKey}
        action="signup"
      />{/if}
    <FormError message={task.error} />
    {#if task.code === 'email_taken'}
      <p class="small">
        <Trans text="<signin>Sign in instead</signin> or <reset>reset your password</reset>.">
          {#snippet signin(s: string)}<a href="{resolve('signin')}?email={encodeURIComponent(email.trim())}"
              >{s}</a
            >{/snippet}
          {#snippet reset(s: string)}<a href="{resolve('forgot')}?email={encodeURIComponent(email.trim())}"
              >{s}</a
            >{/snippet}
        </Trans>
      </p>
    {/if}
    <SubmitButton {task} busyLabel={t('Creating your account…')}>{t('Create account')}</SubmitButton>
  </form>

  <p class="muted">
    {t('Already have an account?')}
    <a href="{resolve('signin')}{next ? `?next=${encodeURIComponent(next)}` : ''}">{t('Sign in')}</a>
  </p>
  <p class="muted small">
    <Trans
      text="By creating an account you agree to the <terms>terms</terms> and <privacy>privacy policy</privacy>."
    >
      {#snippet terms(s: string)}<a href={resolve('terms')}>{s}</a>{/snippet}
      {#snippet privacy(s: string)}<a href={resolve('privacy')}>{s}</a>{/snippet}
    </Trans>
  </p>
</AuthShell>
