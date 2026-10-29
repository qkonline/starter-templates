<!--
  The admin area (PRD section 6): only when /features has it on, and only for the app's admins
  (`user.isAdmin`). The backend checks every request too; this only keeps the pages out of view.
-->
<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { appName } from '#lib/config.ts';
  import { auth } from '#lib/session.svelte.ts';

  let { children } = $props();

  const allowed = $derived(!!auth.features?.admin && !!auth.user?.isAdmin && !auth.support);
  const sections = [
    { path: resolve('admin'), label: 'Overview' },
    { path: resolve('admin/people'), label: 'People' },
    { path: resolve('admin/messages'), label: 'Messages' },
    { path: resolve('admin/errors'), label: 'Errors' },
    { path: resolve('admin/audit'), label: 'Audit log' },
  ];
</script>

<svelte:head><title>Admin · {appName}</title></svelte:head>

{#if allowed}
  <!-- ph-no-capture: PostHog's autocapture records nothing in here (people, emails, messages). -->
  <div class="admin ph-no-capture">
    <nav class="sub" aria-label="Admin">
      {#each sections as s (s.path)}
        <a href={s.path} aria-current={page.url.pathname === s.path ? 'page' : undefined}>{s.label}</a>
      {/each}
    </nav>
    {@render children()}
  </div>
{:else}
  <div class="stack">
    <h1>Not available</h1>
    <p class="muted">This part of {appName} is for its admins.</p>
  </div>
{/if}

<style>
  .admin {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .sub {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--color-border);
  }

  .sub a {
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-sm);
    color: var(--color-muted);
    text-decoration: none;
    font-size: var(--text-sm);
    font-weight: 560;
  }

  .sub a:hover {
    background: var(--color-sunken);
    color: var(--color-text);
  }

  .sub a[aria-current='page'] {
    background: var(--color-sunken);
    color: var(--color-text);
  }
</style>
