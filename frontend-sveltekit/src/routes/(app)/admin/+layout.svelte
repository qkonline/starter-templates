<!--
  The admin area (PRD section 6): only when /features has it on, and only for the app's admins
  (`user.isAdmin`). The backend checks every request too; this only keeps the pages out of view.
-->
<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { appName } from '#lib/config.ts';
  import { auth } from '#lib/session.svelte.ts';
  import { msg, t } from '#lib/i18n/index.svelte.ts';

  let { children } = $props();

  const allowed = $derived(!!auth.features?.admin && !!auth.user?.isAdmin && !auth.support);
  const sections = [
    { path: resolve('admin'), label: msg('Overview') },
    { path: resolve('admin/people'), label: msg('People') },
    { path: resolve('admin/messages'), label: msg('Messages') },
    { path: resolve('admin/errors'), label: msg('Errors') },
    { path: resolve('admin/audit'), label: msg('Audit log') },
  ];
</script>

<svelte:head><title>{t('Admin')} · {appName}</title></svelte:head>

{#if allowed}
  <!-- ph-no-capture: PostHog's autocapture records nothing in here (people, emails, messages). -->
  <div class="admin ph-no-capture">
    <nav class="sub" aria-label={t('Admin')}>
      {#each sections as s (s.path)}
        <a href={s.path} aria-current={page.url.pathname === s.path ? 'page' : undefined}>{t(s.label)}</a>
      {/each}
    </nav>
    {@render children()}
  </div>
{:else}
  <div class="stack">
    <h1>{t('Not available')}</h1>
    <p class="muted">{t('This part of {app} is for its admins.', { app: appName })}</p>
  </div>
{/if}

<style>
  .admin {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  /* Tabs: the current one underlined in the brand colour, like the main bar. */
  .sub {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    border-bottom: 1px solid var(--color-border-strong);
  }

  .sub a {
    padding: var(--space-2) var(--space-3);
    color: var(--color-text);
    text-decoration: none;
    font-size: var(--text-sm);
    box-shadow: inset 0 -2px 0 transparent;
    transition:
      color 160ms cubic-bezier(0.2, 0, 0, 1),
      box-shadow 160ms cubic-bezier(0.2, 0, 0, 1);
  }

  .sub a:hover {
    color: var(--color-link);
  }

  .sub a[aria-current='page'] {
    color: var(--color-link);
    box-shadow: inset 0 -2px 0 var(--color-accent);
  }
</style>
