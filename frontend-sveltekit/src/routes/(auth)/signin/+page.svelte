<!--
  Sign in (PRD R1.1, R1.6, R1.9, R1.10): email and password; a passkey; Google and an emailed
  code only when /auth/methods has them on.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { api } from '#lib/api/index.ts';
  import { newOAuthNonce, oauthReturn } from '#lib/oauth.ts';
  import { emailProblem, makeKeys } from '#lib/password.ts';
  import {
    autofillSupported,
    passkeysSupported,
    signInWithPasskey,
    stopPasskeyAutofill,
  } from '#lib/passkeys.ts';
  import { auth, signedIn } from '#lib/session.svelte.ts';
  import { Task } from '#lib/task.svelte.ts';
  import AuthShell from '#lib/components/AuthShell.svelte';
  import Captcha from '#lib/components/Captcha.svelte';
  import CodeInput from '#lib/components/CodeInput.svelte';
  import FormError from '#lib/components/FormError.svelte';
  import PasswordInput from '#lib/components/PasswordInput.svelte';
  import SubmitButton from '#lib/components/SubmitButton.svelte';
  import Button from '#lib/components/ui/Button.svelte';
  import Divider from '#lib/components/ui/Divider.svelte';
  import Field from '#lib/components/ui/Field.svelte';
  import Input from '#lib/components/ui/Input.svelte';
  import Notice from '#lib/components/ui/Notice.svelte';

  const methods = $derived(auth.methods!);
  // Derived, so a link to this page with other parameters (another `next`) is followed.
  const next = $derived(page.url.searchParams.get('next'));
  const expired = $derived(page.url.searchParams.get('expired') === '1');

  let mode = $state<'password' | 'code' | 'code-sent'>('password');
  // Only where the field starts; after that it's the person's typing.
  let email = $state(page.url.searchParams.get('email') ?? '');
  let password = $state('');
  let code = $state('');
  let captcha = $state<ReturnType<typeof Captcha>>();
  let canPasskey = $state(false);

  const task = new Task();
  const passkeyTask = new Task();

  onMount(() => {
    canPasskey = passkeysSupported();
    // Offer passkeys in the email field's suggestions where the browser can.
    autofillSupported().then((ok) => {
      if (!ok) return;
      signInWithPasskey(true)
        .then((r) => signedIn(r, next))
        .catch((e) => {
          if (e?.code === 'passkey_refused') passkeyTask.error = e.message;
        });
    });
    return stopPasskeyAutofill;
  });

  function withPassword(e: SubmitEvent) {
    e.preventDefault();
    const problem = emailProblem(email) ?? (password ? null : 'Enter your password.');
    if (problem) {
      task.error = problem;
      return;
    }
    task.run(async () => {
      const [keys, token] = await Promise.all([
        makeKeys(password, email, methods.password),
        captcha?.token(),
      ]);
      await signedIn(await api.signIn(email.trim(), keys.key, token, keys.previous), next);
    });
  }

  function withPasskey() {
    task.clear();
    passkeyTask.run(async () => {
      await signedIn(await signInWithPasskey(), next);
    });
  }

  function sendCode(e?: SubmitEvent) {
    e?.preventDefault();
    const problem = emailProblem(email);
    if (problem) {
      task.error = problem;
      return;
    }
    task.run(async () => {
      await api.sendCode(email.trim(), await captcha?.token());
      mode = 'code-sent';
    });
  }

  function verifyCode(e: SubmitEvent) {
    e.preventDefault();
    task.run(async () => {
      await signedIn(await api.verifyCode(email.trim(), code), next);
    });
  }

  function switchTo(m: typeof mode) {
    task.clear();
    mode = m;
  }

  /** Off to Google, with a nonce only this tab knows in the way back (#lib/oauth.ts). */
  function withGoogle() {
    const nonce = newOAuthNonce();
    if (!nonce) {
      task.error = 'This browser blocks storage for this site, so signing in with Google can’t work here.';
      return;
    }
    try {
      if (next) sessionStorage.setItem('starter:next', next);
    } catch {
      /* ignore */
    }
    const back = oauthReturn(`${location.origin}${resolve('auth/callback')}`, nonce);
    window.location.assign(api.oauthStartUrl('google', back));
  }

  const google = $derived(methods.oauth.includes('google'));
</script>

<AuthShell title="Sign in">
  {#if expired}
    <Notice role="status">You were signed out. Sign in again to carry on.</Notice>
  {/if}

  {#if mode === 'password'}
    <form class="stack" onsubmit={withPassword} novalidate>
      <Field label="Email" id="email">
        <Input
          type="email"
          bind:value={email}
          autocomplete="username webauthn"
          autocapitalize="off"
          spellcheck="false"
          required
        />
      </Field>
      <PasswordInput id="password" bind:value={password} />
      {#if methods.captcha}<Captcha
          bind:this={captcha}
          siteKey={methods.captcha.siteKey}
          action="signin"
        />{/if}
      <FormError message={task.error} />
      <SubmitButton {task} busyLabel="Signing in…">Sign in</SubmitButton>
      <p class="small">
        <a href="{resolve('forgot')}{email ? `?email=${encodeURIComponent(email.trim())}` : ''}"
          >Forgot your password?</a
        >
      </p>
    </form>
  {:else if mode === 'code'}
    <form class="stack" onsubmit={sendCode} novalidate>
      <Field label="Email" id="code-email">
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
          action="code"
        />{/if}
      <FormError message={task.error} />
      <SubmitButton {task} busyLabel="Sending…">Email me a code</SubmitButton>
      <p class="small">
        <Button type="button" variant="link" onclick={() => switchTo('password')}
          >Use my password instead</Button
        >
      </p>
    </form>
  {:else}
    <form class="stack" onsubmit={verifyCode} novalidate>
      <p>We sent a code to <strong>{email.trim()}</strong>. It works for 10 minutes.</p>
      <CodeInput id="code" bind:value={code} />
      <FormError message={task.error} />
      <SubmitButton {task} busyLabel="Checking…">Sign in</SubmitButton>
      <p class="small">
        <Button type="button" variant="link" onclick={() => switchTo('code')}>Send a new code</Button>
      </p>
    </form>
  {/if}

  {#if canPasskey || google || (methods.emailCode && mode === 'password')}
    <Divider>or</Divider>
    <div class="stack others">
      {#if canPasskey}
        <SubmitButton
          task={passkeyTask}
          type="button"
          variant="plain"
          busyLabel="Waiting for your device…"
          onclick={withPasskey}
        >
          Sign in with a passkey
        </SubmitButton>
      {/if}
      {#if google}
        <Button type="button" wide onclick={withGoogle}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.43.35-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l3.66-2.84z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.95 10.95 0 0 0 12 1 11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
            />
          </svg>
          Continue with Google
        </Button>
      {/if}
      {#if methods.emailCode && mode === 'password'}
        <Button type="button" wide onclick={() => switchTo('code')}>Email me a code instead</Button>
      {/if}
      <FormError message={passkeyTask.error} />
    </div>
  {/if}

  <p class="muted">
    New here? <a href="{resolve('signup')}{next ? `?next=${encodeURIComponent(next)}` : ''}"
      >Create an account</a
    >
  </p>
</AuthShell>

<style>
  .others {
    gap: var(--space-3);
  }
</style>
