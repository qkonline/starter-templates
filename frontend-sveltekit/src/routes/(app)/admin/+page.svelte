<!-- The admin area's front page: the counts (PRD R6.2). -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { api, type AdminStats } from '#lib/api/index.ts';
  import { Task } from '#lib/task.svelte.ts';
  import FormError from '#lib/components/FormError.svelte';

  let stats = $state<AdminStats | null>(null);
  const load = new Task();

  onMount(() => {
    load.run(async () => {
      stats = await api.adminStats();
    });
  });

  const tiles = $derived(
    stats
      ? [
          { label: 'People', value: stats.users, href: resolve('admin/people') },
          { label: 'New this week', value: stats.newUsers7d, href: resolve('admin/people') },
          { label: 'Suspended', value: stats.suspended, href: resolve('admin/people') },
          ...(stats.teams === null ? [] : [{ label: 'Teams', value: stats.teams, href: null }]),
          { label: 'Open messages', value: stats.openMessages, href: resolve('admin/messages') },
          { label: 'Errors, last 24 hours', value: stats.errors24h, href: resolve('admin/errors') },
        ]
      : [],
  );
</script>

<h1>Admin</h1>
{#if stats}
  <dl class="tiles">
    {#each tiles as t (t.label)}
      <div class="tile">
        <dt class="muted small">{t.label}</dt>
        <dd>
          {#if t.href}<a href={t.href}>{t.value.toLocaleString()}</a>{:else}{t.value.toLocaleString()}{/if}
        </dd>
      </div>
    {/each}
  </dl>
{:else if load.error}
  <FormError message={load.error} />
{:else}
  <p class="muted">Loading…</p>
{/if}

<style>
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
    gap: var(--space-3);
    margin: 0;
  }

  .tile {
    padding: var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }

  dd {
    margin: var(--space-1) 0 0;
    font-size: var(--text-xl);
    font-weight: 620;
    font-variant-numeric: tabular-nums;
  }

  dd a {
    color: inherit;
    text-decoration: none;
  }

  dd a:hover {
    text-decoration: underline;
  }
</style>
