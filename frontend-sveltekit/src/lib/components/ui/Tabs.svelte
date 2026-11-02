<!--
  Tabs above one panel (DaisyUI's tabs): a tab list, arrow keys move between tabs, and the
  panel shows the chosen one's content.

    <Tabs label="Settings" tabs={[{ id: 'general', label: 'General' }, …]} bind:value={tab}>
      {#snippet panel(id)}{#if id === 'general'}…{/if}{/snippet}
    </Tabs>
-->
<script lang="ts" generics="T extends string">
  import type { Snippet } from 'svelte';

  const uid = $props.id();

  let {
    label,
    tabs,
    value = $bindable(),
    look = 'border',
    panel,
    onchange,
  }: {
    /** What the tabs are, for screen readers. */
    label: string;
    tabs: readonly { id: T; label: string; disabled?: boolean }[];
    /** The open tab; the first when undefined. */
    value?: T;
    look?: 'border' | 'box' | 'lift';
    panel: Snippet<[T]>;
    onchange?: (id: T) => void;
  } = $props();

  // Written out in full: Tailwind builds only the class names it finds in the source.
  const looks = { border: 'tabs-border', box: 'tabs-box', lift: 'tabs-lift' };
  const current = $derived(value ?? tabs[0]?.id);
  const buttons: HTMLButtonElement[] = $state([]);

  function choose(id: T) {
    value = id;
    onchange?.(id);
  }

  function key(e: KeyboardEvent, i: number) {
    const step = { ArrowRight: 1, ArrowLeft: -1, Home: -i, End: tabs.length - 1 - i }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const rtl = getComputedStyle(e.currentTarget as Element).direction === 'rtl';
    const dir = rtl && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') ? -step : step;
    const next = (i + dir + tabs.length) % tabs.length;
    const tab = tabs[next];
    if (!tab) return;
    buttons[next]?.focus();
    choose(tab.id);
  }
</script>

<div class="tabs-wrap flow">
  <div role="tablist" aria-label={label} class={['tabs', looks[look]]}>
    {#each tabs as tab, i (tab.id)}
      <button
        bind:this={buttons[i]}
        type="button"
        role="tab"
        id="{uid}-{tab.id}"
        class={['tab', { 'tab-active': tab.id === current }]}
        aria-selected={tab.id === current}
        aria-controls="{uid}-panel"
        tabindex={tab.id === current ? 0 : -1}
        disabled={tab.disabled}
        onclick={() => choose(tab.id)}
        onkeydown={(e) => key(e, i)}>{tab.label}</button
      >
    {/each}
  </div>
  {#if current}
    <div role="tabpanel" id="{uid}-panel" aria-labelledby="{uid}-{current}" class="panel">
      {@render panel(current)}
    </div>
  {/if}
</div>

<style>
  .panel {
    padding-top: var(--space-4);
  }
</style>
