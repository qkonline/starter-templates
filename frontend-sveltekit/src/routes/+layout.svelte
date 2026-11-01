<!--
  Around every page: the support-session banner, the offline line, the update prompt, the
  analytics consent banner, page views and error reporting. Public pages are prerendered with
  this layout, so everything that needs the browser starts in onMount.
-->
<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { browser } from '$app/env';
  import { afterNavigate } from '$app/navigation';
  import { analytics, routeName } from '#lib/analytics/index.ts';
  import { isSupportTab } from '#lib/device.ts';
  import { followThemeColor } from '#lib/preferences.ts';
  import { startPwa } from '#lib/pwa.svelte.ts';
  import { startErrorReporting } from '#lib/report.ts';
  import { auth, loadSupport } from '#lib/session.svelte.ts';
  import ConsentBanner from '#lib/components/shell/ConsentBanner.svelte';
  import OfflineBanner from '#lib/components/shell/OfflineBanner.svelte';
  import SupportBanner from '#lib/components/shell/SupportBanner.svelte';
  import UpdateToast from '#lib/components/shell/UpdateToast.svelte';

  let { children } = $props();

  // Before any page asks who is signed in: is this tab a support session?
  if (browser) loadSupport();

  let started = $state(false);

  onMount(() => {
    const stop = startErrorReporting();
    const stopThemeColor = followThemeColor();
    startPwa();
    // A support session is an admin at work, not the person: no analytics in that tab, even after
    // it ended (nor on the page that starts one).
    if (!isSupportTab() && !location.pathname.endsWith('/support')) analytics.start();
    started = true;
    return () => {
      stop();
      stopThemeColor();
    };
  });

  // Registered after onMount above, so the first page view comes once analytics has started.
  // The route's name, not the page's title: a title can hold a team's name.
  afterNavigate(({ to }) => {
    if (to && !auth.support) analytics.page(to.url.href, routeName(to.route.id));
  });
</script>

<a class="skip-link" href="#main">Skip to content</a>
<SupportBanner />
<OfflineBanner />
{@render children()}
{#if started}
  <UpdateToast />
  {#if !auth.support}<ConsentBanner />{/if}
{/if}
