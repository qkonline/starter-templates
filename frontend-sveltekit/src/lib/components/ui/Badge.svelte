<!-- A short label beside a name: "This device", "Admin", "Unconfirmed". -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { tone = 'accent', children }: { tone?: 'accent' | 'danger' | 'plain'; children: Snippet } = $props();
</script>

<span class={['badge', tone]}>{@render children()}</span>

<style>
  .badge {
    display: inline-block;
    margin-left: var(--space-2);
    padding: 0 var(--space-2);
    font-size: var(--text-xs);
    font-weight: var(--badge-weight);
    line-height: 1.25rem;
    white-space: nowrap;
    border: var(--badge-border-width) solid transparent;
    border-radius: var(--badge-radius);
    vertical-align: 0.1em;
  }

  .accent {
    color: var(--color-accent-soft-text);
    background: var(--color-accent-soft);
    border-color: var(--color-accent-border);
  }

  .danger {
    color: var(--color-danger-text);
    background: var(--color-danger-soft);
    border-color: var(--color-danger-border);
  }

  .plain {
    color: var(--color-text);
    background: var(--color-sunken);
    border-color: var(--color-border-strong);
  }
</style>
