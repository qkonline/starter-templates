<!--
  In place of a form's error when the backend answered `email_unverified`: passkeys and team
  invites need a confirmed email, whatever the app's `requireVerifiedEmail`. Says what to do and
  where: the Email section of the account page sends the code.
-->
<script lang="ts">
  import { resolve } from '$app/paths';
  import { msg } from '#lib/i18n/index.svelte.ts';
  import Trans from './Trans.svelte';

  /** What the person was trying to do, e.g. "add a passkey". */
  let { action }: { action: string } = $props();
</script>

<div role="alert">
  <p class="error">
    <Trans
      text={msg(
        'Confirm your email address first, then {action}. Under Email on your account page, send yourself a code and enter it. <link>Confirm your email</link>',
      )}
      vars={{ action }}
    >
      {#snippet link(s: string)}<a href="{resolve('account')}#email">{s}</a>{/snippet}
    </Trans>
  </p>
</div>
