<!--
  Asks once whether analytics may run (PRD R3.4). Shown only when PostHog or Google Analytics is
  configured; until the person says yes neither is loaded. The choice is remembered on the
  device and can be changed on the account page.
-->
<script lang="ts">
  import { resolve } from '$app/paths';
  import { analytics } from '#lib/analytics/index.ts';
  import { appName } from '#lib/config.ts';
  import { msg, t } from '#lib/i18n/index.svelte.ts';
  import Trans from '../Trans.svelte';
  import Button from '../ui/Button.svelte';

  let open = $state(analytics.needsConsent);

  function choose(choice: 'granted' | 'denied') {
    analytics.setConsent(choice);
    open = false;
  }
</script>

{#if open}
  <div class="consent pop" role="region" aria-label={t('Cookies')}>
    <p>
      <Trans
        text={msg(
          '{appName} would like to use analytics cookies to learn how the app is used. Nothing is loaded, stored or sent until you say yes. <link>Privacy</link>',
        )}
        vars={{ appName }}
      >
        {#snippet link(s: string)}<a href={resolve('privacy')}>{s}</a>{/snippet}
      </Trans>
    </p>
    <div class="row">
      <Button type="button" size="small" variant="primary" onclick={() => choose('granted')}
        >{t('Allow')}</Button
      >
      <Button type="button" size="small" onclick={() => choose('denied')}>{t('No thanks')}</Button>
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
