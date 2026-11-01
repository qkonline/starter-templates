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
  import { t, tn } from '#lib/i18n/index.svelte.ts';

  const user = $derived(auth.user!);
  const support = $derived(!!auth.support);
  let devices = $state<ReturnType<typeof Devices>>();
</script>

<svelte:head><title>{t('Account')} · {appName}</title></svelte:head>

<div class="page stack">
  <header class="head">
    <div class="titles">
      <h1>{t('Account')}</h1>
      <p class="muted">{t('How you appear in {app}, and how you sign in.', { app: appName })}</p>
    </div>
    <Button type="button" onclick={signOut}>{support ? t('End support session') : t('Sign out')}</Button>
  </header>

  {#if !support && syncState.pending > 0}
    <Notice>
      {tn(
        syncState.pending,
        '1 change made on this device hasn’t reached {app} yet. If you sign out now, it stays on this device and is sent the next time you sign in here.',
        '{count} changes made on this device haven’t reached {app} yet. If you sign out now, they stay on this device and are sent the next time you sign in here.',
        { app: appName },
      )}
    </Notice>
  {/if}

  {#if support}
    <Notice>
      {t(
        'This is a support session. Profile, email, password, passkeys, devices, notifications and data aren’t available here.',
      )}
    </Notice>
  {:else}
    <Panel title={t('Profile')} description={t('How you appear in {app}.', { app: appName })}
      ><Profile /></Panel
    >

    <Panel id="email" title={t('Email')}>
      {#snippet description()}
        {user.email}
        {#if user.emailVerified}<Badge>{t('Confirmed')}</Badge>{:else}<Badge tone="danger"
            >{t('Not confirmed')}</Badge
          >{/if}
      {/snippet}
      <div class="stack">
        {#if !user.emailVerified}
          <div class="stack">
            <h3>{t('Confirm your address')}</h3>
            <ConfirmEmail />
          </div>
        {/if}
        <div class="stack">
          {#if !user.emailVerified}<h3>{t('Change your address')}</h3>{/if}
          <ChangeEmail />
        </div>
      </div>
    </Panel>

    <Panel title={t('Password')} description={t('Your password never leaves this device.')}>
      <PasswordSection onChanged={() => devices?.reload()} />
    </Panel>

    <Panel
      title={t('Passkeys')}
      description={t('Sign in with Face ID, Touch ID, Windows Hello or a security key.')}
    >
      <Passkeys />
    </Panel>

    <Panel title={t('Devices')} description={t('Where your account is signed in.')}
      ><Devices bind:this={devices} /></Panel
    >

    {#if auth.features?.push}
      <Panel
        title={t('Notifications')}
        description={t('On this device, even when {app} is closed.', { app: appName })}
      >
        <PushSection />
      </Panel>
    {/if}
  {/if}

  <Panel title={t('Display')} description={t('Theme, mode and text size on this device.')}
    ><DisplaySection /></Panel
  >

  {#if !support}
    <Panel title={t('Data')} description={t('Take your data with you, or remove it.')}><DataSection /></Panel>
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
