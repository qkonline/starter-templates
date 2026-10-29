<!--
  In place of a form's error when the backend answered `email_unverified`: passkeys and team
  invites need a confirmed email, whatever the app's `requireVerifiedEmail`. Says what to do and
  where: the Email section of the account page sends the code.
-->
<script lang="ts">
  import { resolve } from '$app/paths';

  /** What the person was trying to do, e.g. "add a passkey". */
  let { action }: { action: string } = $props();
</script>

<div role="alert">
  <p class="error">
    Confirm your email address first, then {action}. Under Email on your account page, send yourself a code
    and enter it. <a href="{resolve('account')}#email">Confirm your email</a>
  </p>
</div>
