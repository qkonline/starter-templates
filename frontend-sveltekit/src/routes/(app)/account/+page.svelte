<!--
  The account (PRD section 2), one section per thing a person manages, plus display preferences
  (R3.2) and push on this device (R4.2). In a support session (R6.3) the account and security
  sections are left out: the backend refuses them there.
-->
<script lang="ts">
  import { appName } from '#lib/config.ts';
  import { auth, signOut } from '#lib/session.svelte.ts';
  import ChangeEmail from '#lib/components/account/ChangeEmail.svelte';
  import ConfirmEmail from '#lib/components/account/ConfirmEmail.svelte';
  import DataSection from '#lib/components/account/DataSection.svelte';
  import Devices from '#lib/components/account/Devices.svelte';
  import DisplaySection from '#lib/components/account/DisplaySection.svelte';
  import PushSection from '#lib/components/account/PushSection.svelte';
  import Passkeys from '#lib/components/account/Passkeys.svelte';
  import PasswordSection from '#lib/components/account/PasswordSection.svelte';
  import Profile from '#lib/components/account/Profile.svelte';

  const user = $derived(auth.user!);
  const support = $derived(!!auth.support);
  let devices = $state<ReturnType<typeof Devices>>();
</script>

<svelte:head><title>Account · {appName}</title></svelte:head>

<div class="page">
  <header class="head">
    <h1>Account</h1>
    <button type="button" class="btn" onclick={signOut}>{support ? 'End support session' : 'Sign out'}</button
    >
  </header>

  {#if support}
    <p class="notice">
      This is a support session. Profile, email, password, passkeys, devices, notifications and data aren’t
      available here.
    </p>
  {:else}
    <section aria-labelledby="profile-h">
      <div class="intro">
        <h2 id="profile-h">Profile</h2>
        <p class="muted small">How you appear in {appName}.</p>
      </div>
      <div class="body stack"><Profile /></div>
    </section>

    <section id="email" aria-labelledby="email-h">
      <div class="intro">
        <h2 id="email-h">Email</h2>
        <p class="muted small">
          {user.email}
          {#if user.emailVerified}<span class="badge">Confirmed</span>{:else}<span class="badge unconfirmed"
              >Not confirmed</span
            >{/if}
        </p>
      </div>
      <div class="body stack">
        {#if !user.emailVerified}
          <div class="stack">
            <h3>Confirm your address</h3>
            <ConfirmEmail />
          </div>
        {/if}
        <div class="stack">
          <h3>Change your address</h3>
          <ChangeEmail />
        </div>
      </div>
    </section>

    <section aria-labelledby="password-h">
      <div class="intro">
        <h2 id="password-h">Password</h2>
        <p class="muted small">Your password never leaves this device.</p>
      </div>
      <div class="body"><PasswordSection onChanged={() => devices?.reload()} /></div>
    </section>

    <section aria-labelledby="passkeys-h">
      <div class="intro">
        <h2 id="passkeys-h">Passkeys</h2>
        <p class="muted small">Sign in with Face ID, Touch ID, Windows Hello or a security key.</p>
      </div>
      <div class="body"><Passkeys /></div>
    </section>

    <section aria-labelledby="devices-h">
      <div class="intro">
        <h2 id="devices-h">Devices</h2>
        <p class="muted small">Where your account is signed in.</p>
      </div>
      <div class="body"><Devices bind:this={devices} /></div>
    </section>

    {#if auth.features?.push}
      <section aria-labelledby="push-h">
        <div class="intro">
          <h2 id="push-h">Notifications</h2>
          <p class="muted small">On this device, even when {appName} is closed.</p>
        </div>
        <div class="body"><PushSection /></div>
      </section>
    {/if}

    <section aria-labelledby="data-h">
      <div class="intro">
        <h2 id="data-h">Data</h2>
        <p class="muted small">Take your data with you, or remove it.</p>
      </div>
      <div class="body"><DataSection /></div>
    </section>
  {/if}

  <section aria-labelledby="display-h">
    <div class="intro">
      <h2 id="display-h">Display</h2>
      <p class="muted small">Theme and text size on this device.</p>
    </div>
    <div class="body"><DisplaySection /></div>
  </section>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding-bottom: var(--space-5);
  }

  /* A settings document: hairline rules between sections; heading beside content on wide screens. */
  section {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-6) 0;
    border-top: 1px solid var(--color-border);
    scroll-margin-top: var(--space-4);
  }

  .intro {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .body {
    min-width: 0;
    max-width: 32rem;
  }

  .body :global(h3) {
    font-size: var(--text-sm);
  }

  .badge.unconfirmed {
    color: var(--color-danger);
    background: var(--color-danger-soft);
  }

  @media (min-width: 48rem) {
    section {
      grid-template-columns: 14rem 1fr;
      gap: var(--space-6);
    }
  }
</style>
