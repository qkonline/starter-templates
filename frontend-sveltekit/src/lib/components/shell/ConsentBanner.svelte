<!--
  Asks once whether analytics may run (PRD R3.4). Shown only when PostHog or Google Analytics is
  configured; until the person says yes neither is loaded. The choice is remembered on the
  device and can be changed on the account page.
-->
<script lang="ts">
  import { resolve } from '$app/paths';
  import { analytics } from '#lib/analytics/index.ts';
  import { appName } from '#lib/config.ts';

  let open = $state(analytics.needsConsent);

  function choose(choice: 'granted' | 'denied') {
    analytics.setConsent(choice);
    open = false;
  }
</script>

{#if open}
  <div class="consent pop" role="region" aria-label="Cookies">
    <p>
      {appName} would like to use analytics cookies to learn how the app is used. Nothing is loaded, stored or sent
      until you say yes. <a href={resolve('privacy')}>Privacy</a>
    </p>
    <div class="row">
      <button type="button" class="btn small primary" onclick={() => choose('granted')}>Allow</button>
      <button type="button" class="btn small" onclick={() => choose('denied')}>No thanks</button>
    </div>
  </div>
{/if}

<style>
  .consent {
    position: fixed;
    z-index: var(--z-pop);
    left: var(--space-4);
    bottom: calc(var(--space-4) + env(safe-area-inset-bottom));
    width: min(26rem, calc(100vw - 2 * var(--space-4)));
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
    font-size: var(--text-sm);
  }

  .row {
    gap: var(--space-2);
  }
</style>
