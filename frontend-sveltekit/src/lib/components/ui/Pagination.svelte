<!--
  Pages of a list (DaisyUI's join of buttons): previous, the pages near this one, next.

    <Pagination bind:page pages={12} onchange={load} />
-->
<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';

  let {
    page = $bindable(1),
    pages,
    size = 'md',
    onchange,
  }: {
    /** From 1. */
    page?: number;
    pages: number;
    size?: 'xs' | 'sm' | 'md' | 'lg';
    onchange?: (page: number) => void;
  } = $props();

  // Written out in full: Tailwind builds only the class names it finds in the source.
  const sizes = { xs: 'btn-xs', sm: 'btn-sm', md: '', lg: 'btn-lg' };

  /** The first, the last, and two either side of this one, with gaps (0) between. */
  const shown = $derived.by(() => {
    const near = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
    const list: number[] = [];
    for (const n of [...near].sort((a, b) => a - b)) {
      const last = list.at(-1);
      if (last !== undefined && n - last > 1) list.push(0);
      list.push(n);
    }
    return list;
  });

  function go(n: number) {
    if (n < 1 || n > pages || n === page) return;
    page = n;
    onchange?.(n);
  }
</script>

<nav aria-label={t('Pages')}>
  <div class="join">
    <button
      type="button"
      class={['join-item btn', sizes[size]]}
      disabled={page <= 1}
      onclick={() => go(page - 1)}
      ><span aria-hidden="true">‹</span><span class="visually-hidden">{t('Previous page')}</span></button
    >
    {#each shown as n, i (n || `gap-${i}`)}
      {#if n === 0}
        <span class={['join-item btn btn-disabled', sizes[size]]} aria-hidden="true">…</span>
      {:else}
        <button
          type="button"
          class={['join-item btn', sizes[size], { 'btn-active btn-primary': n === page }]}
          aria-current={n === page ? 'page' : undefined}
          aria-label={t('Page {n}', { n })}
          onclick={() => go(n)}>{n}</button
        >
      {/if}
    {/each}
    <button
      type="button"
      class={['join-item btn', sizes[size]]}
      disabled={page >= pages}
      onclick={() => go(page + 1)}
      ><span aria-hidden="true">›</span><span class="visually-hidden">{t('Next page')}</span></button
    >
  </div>
</nav>
