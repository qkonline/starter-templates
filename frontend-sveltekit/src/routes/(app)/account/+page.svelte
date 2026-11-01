<!--
  The account (PRD section 2), one section per thing a person manages, plus display preferences
  (R3.2) and push on this device (R4.2). In a support session (R6.3) the account and security
  sections are left out: the backend refuses them there.
-->
<script lang="ts">
  import { appName } from '#lib/config.ts';
  import { syncState } from '#lib/db/index.svelte.ts';
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
  import Badge from '#lib/components/ui/Badge.svelte';
  import Button from '#lib/components/ui/Button.svelte';
  import Notice from '#lib/components/ui/Notice.svelte';
  import Panel from '#lib/components/ui/Panel.svelte';

  const user = $derived(auth.user!);
  const support = $derived(!!auth.support);
  let devices = $state<ReturnType<typeof Devices>>();
</script>

<svelte:head><title>Account · {appName}</title></svelte:head>

<div class="page stack">
  <header class="head">
    <div class="titles">
      <h1>Account</h1>
      <p class="muted">How you appear in {appName}, and how you sign in.</p>
    </div>
    <Button type="button" onclick={signOut}>{support ? 'End support session' : 'Sign out'}</Button>
  </header>

  {#if !support && syncState.pending > 0}
    <Notice>
      {syncState.pending === 1 ? '1 change' : `${syncState.pending} changes`} made on this device {syncState.pending ===
      1
        ? 'hasn’t'
        : 'haven’t'} reached {appName} yet. If you sign out now, {syncState.pending === 1
        ? 'it stays'
        : 'they stay'}
      on this device and {syncState.pending === 1 ? 'is' : 'are'} sent the next time you sign in here.
    </Notice>
  {/if}

  {#if support}
    <Notice>
      This is a support session. Profile, email, password, passkeys, devices, notifications and data aren’t
      available here.
    </Notice>
  {:else}
    <Panel title="Profile" description="How you appear in {appName}."><Profile /></Panel>

    <Panel id="email" title="Email">
      {#snippet description()}
        {user.email}
        {#if user.emailVerified}<Badge>Confirmed</Badge>{:else}<Badge tone="danger">Not confirmed</Badge>{/if}
      {/snippet}
      <div class="stack">
        {#if !user.emailVerified}
          <div class="stack">
            <h3>Confirm your address</h3>
            <ConfirmEmail />
          </div>
        {/if}
        <div class="stack">
          {#if !user.emailVerified}<h3>Change your address</h3>{/if}
          <ChangeEmail />
        </div>
      </div>
    </Panel>

    <Panel title="Password" description="Your password never leaves this device.">
      <PasswordSection onChanged={() => devices?.reload()} />
    </Panel>

    <Panel title="Passkeys" description="Sign in with Face ID, Touch ID, Windows Hello or a security key.">
      <Passkeys />
    </Panel>

    <Panel title="Devices" description="Where your account is signed in."
      ><Devices bind:this={devices} /></Panel
    >

    {#if auth.features?.push}
      <Panel title="Notifications" description="On this device, even when {appName} is closed.">
        <PushSection />
      </Panel>
    {/if}
  {/if}

  <Panel title="Display" description="Theme, mode and text size on this device."><DisplaySection /></Panel>

  {#if !support}
    <Panel title="Data" description="Take your data with you, or remove it."><DataSection /></Panel>
  {/if}
</div>

<style>
  .page {
    gap: var(--space-5);
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .titles {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  /* Forms keep a readable width inside the wider panels; lists (devices, passkeys) span them. */
  .page :global(.panel .body form),
  .page :global(.panel .body > p) {
    max-width: 36rem;
  }

  /* Subsection headings inside a panel: closer to what they head than to what's above. */
  .page :global(.panel .body h3) {
    margin-bottom: calc(var(--space-2) * -1);
  }

  .page :global(.panel .body :not(:first-child) > h3:first-child),
  .page :global(.panel .body h3:not(:first-child)) {
    margin-top: var(--space-3);
  }
</style>
