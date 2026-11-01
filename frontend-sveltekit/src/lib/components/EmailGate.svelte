<!--
  When the app requires a confirmed email (`requireVerifiedEmail`) and this one isn't: the only
  ways on are confirming it, changing the address, or signing out (PRD R1.7).
-->
<script lang="ts">
  import { auth, signOut } from '#lib/session.svelte.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
  import AuthShell from './AuthShell.svelte';
  import ChangeEmail from './account/ChangeEmail.svelte';
  import ConfirmEmail from './account/ConfirmEmail.svelte';
  import Button from './ui/Button.svelte';
  import Divider from './ui/Divider.svelte';

  let changing = $state(false);
</script>

<AuthShell
  title={t('Confirm your email')}
  lead={t('Before you carry on, show us that {email} is yours.', { email: auth.user?.email ?? '' })}
>
  {#if !changing}
    <!-- Signing up sent a code already when the app requires confirmation. -->
    <ConfirmEmail sent />
    <p class="muted small">
      {t('Wrong address?')}
      <Button type="button" variant="link" onclick={() => (changing = true)}>{t('Change it')}</Button>
    </p>
  {:else}
    <ChangeEmail />
    <p class="muted small">
      <Button type="button" variant="link" onclick={() => (changing = false)}
        >{t('Back to confirming')}</Button
      >
    </p>
  {/if}
  <Divider>{t('or')}</Divider>
  <div><Button type="button" onclick={signOut}>{t('Sign out')}</Button></div>
</AuthShell>
