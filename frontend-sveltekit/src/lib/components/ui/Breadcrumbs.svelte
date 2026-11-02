<!--
  Where this page sits (DaisyUI's breadcrumbs): links up the way, the last item is this page.

    <Breadcrumbs items={[{ label: 'Admin', href: resolve('admin') }, { label: 'People' }]} />
-->
<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';

  let { items }: { items: readonly { label: string; href?: string }[] } = $props();
</script>

<nav class="breadcrumbs text-sm" aria-label={t('Breadcrumb')}>
  <ul>
    {#each items as item, i (i)}
      <li>
        {#if item.href && i < items.length - 1}
          <a href={item.href}>{item.label}</a>
        {:else}
          <span aria-current={i === items.length - 1 ? 'page' : undefined}>{item.label}</span>
        {/if}
      </li>
    {/each}
  </ul>
</nav>
