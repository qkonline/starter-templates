<!--
  This copy of the app is older than the backend serves (`client_outdated`, or the backend's
  `minClient`): it fetches the new version and switches to it. Shown in place of the app, since
  what this copy would send next may not be understood any more. What's on the device is kept;
  the new version carries on from it.
-->
<script lang="ts">
  import { forceUpdate, pwa } from '#lib/pwa.svelte.ts';
  import Button from '../ui/Button.svelte';

  let busy = $state(false);
  let notYet = $state(false);

  async function update() {
    busy = true;
    notYet = false;
    notYet = !(await forceUpdate());
    busy = false;
  }
</script>

<main id="main" class="center stack">
  <h1>Update needed</h1>
  <p>This version of the app is out of date. Update it to carry on; nothing you saved is lost.</p>
  {#if !pwa.online}
    <p class="muted">Connect to the internet to get the new version.</p>
  {:else if notYet}
    <p class="muted" role="status">The new version isn’t ready yet. Try again in a few minutes.</p>
  {/if}
  <div><Button variant="primary" onclick={update} disabled={busy || !pwa.online}>Update now</Button></div>
</main>

<style>
  .center {
    min-height: 60dvh;
    max-width: 32rem;
    margin: 0 auto;
    display: grid;
    place-content: center;
    gap: var(--space-4);
    padding: var(--space-4);
  }
</style>
