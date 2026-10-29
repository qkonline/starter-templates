<!--
  A support session (PRD R6.3). The admin area opens this page in a new tab with a one-time code;
  it is traded for a session that lives in this tab only (sessionStorage), so the admin's own
  session on the device is untouched. `?ended=1` is where the tab lands when it ends.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { ApiError, api, messageOf } from '#lib/api/index.ts';
  import { homePath } from '#lib/config.ts';
  import { startSupport } from '#lib/device.ts';
  import { loadSupport } from '#lib/session.svelte.ts';
  import AuthShell from '#lib/components/AuthShell.svelte';
  import Spinner from '#lib/components/Spinner.svelte';

  let phase = $state<'working' | 'ended' | 'failed'>('working');
  let problem = $state('');

  onMount(async () => {
    const params = page.url.searchParams;
    if (params.get('ended') === '1') {
      phase = 'ended';
      return;
    }
    const code = params.get('code');
    // Out of the address bar and history: the code works once.
    await goto(page.url.pathname, { shallow: true, replace: true });
    if (!code) {
      phase = 'failed';
      problem = 'This page needs a support link from the admin area.';
      return;
    }
    try {
      const result = await api.supportExchange(code);
      startSupport({ token: result.token, email: result.user.email });
      loadSupport();
      await goto(resolve(homePath), { replace: true });
    } catch (e) {
      phase = 'failed';
      problem =
        e instanceof ApiError && (e.code === 'invalid_code' || e.code === 'not_found')
          ? 'This support link has expired or was already used. Start a new one from the admin area.'
          : messageOf(e);
    }
  });

  function closeTab() {
    window.close();
  }
</script>

{#if phase === 'ended'}
  <AuthShell title="Support session ended" lead="Nothing in this tab is signed in any more.">
    <p class="muted">Your own session in your other tabs is as it was.</p>
    <div class="row">
      <button type="button" class="btn primary" onclick={closeTab}>Close this tab</button>
      <a class="btn" href={resolve('admin/people')}>Back to the admin area</a>
    </div>
  </AuthShell>
{:else if phase === 'failed'}
  <AuthShell title="Couldn’t start the support session">
    <p role="alert">{problem}</p>
    <div><button type="button" class="btn" onclick={closeTab}>Close this tab</button></div>
  </AuthShell>
{:else}
  <AuthShell title="Starting the support session…">
    <p class="row muted" role="status"><Spinner /> One moment.</p>
  </AuthShell>
{/if}
