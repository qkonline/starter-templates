<!--
  When the app requires a confirmed email (`requireVerifiedEmail`) and this one isn't: the only
  ways on are confirming it, changing the address, or signing out (PRD R1.7).
-->
<script lang="ts">
  import { auth, signOut } from '#lib/session.svelte.ts';
  import AuthShell from './AuthShell.svelte';
  import ChangeEmail from './account/ChangeEmail.svelte';
  import ConfirmEmail from './account/ConfirmEmail.svelte';
  import Button from './ui/Button.svelte';
  import Divider from './ui/Divider.svelte';

  let changing = $state(false);
</script>

<AuthShell title="Confirm your email" lead="Before you carry on, show us that {auth.user?.email} is yours.">
  {#if !changing}
    <!-- Signing up sent a code already when the app requires confirmation. -->
    <ConfirmEmail sent />
    <p class="muted small">
      Wrong address? <Button type="button" variant="link" onclick={() => (changing = true)}>Change it</Button>
    </p>
  {:else}
    <ChangeEmail />
    <p class="muted small">
      <Button type="button" variant="link" onclick={() => (changing = false)}>Back to confirming</Button>
    </p>
  {/if}
  <Divider>or</Divider>
  <div><Button type="button" onclick={signOut}>Sign out</Button></div>
</AuthShell>
