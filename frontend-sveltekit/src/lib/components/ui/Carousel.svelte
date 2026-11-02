<!--
  Things in a row that scroll sideways one at a time (DaisyUI's carousel): photos, cards. Swipe,
  scroll, or the previous and next buttons.

    <Carousel label="Photos" items={photos}>{#snippet item(p)}<img src={p.url} alt={p.alt} />{/snippet}</Carousel>
-->
<script lang="ts" generics="T">
  import type { Snippet } from 'svelte';
  import { t } from '#lib/i18n/index.svelte.ts';

  let {
    label,
    items,
    item,
    width = '100%',
  }: {
    label: string;
    items: readonly T[];
    item: Snippet<[T, number]>;
    /** Of each item: 100% shows one at a time, 50% two. */
    width?: string;
  } = $props();

  let track: HTMLElement;

  function move(by: number) {
    const rtl = getComputedStyle(track).direction === 'rtl' ? -1 : 1;
    track.scrollBy({ left: by * rtl * track.clientWidth, behavior: 'smooth' });
  }
</script>

<section class="wrap flow" aria-roledescription="carousel" aria-label={label}>
  <div bind:this={track} class="carousel carousel-center w-full">
    {#each items as it, i (i)}
      <div
        class="carousel-item"
        style:width
        aria-roledescription="slide"
        aria-label={t('{n} of {total}', { n: i + 1, total: items.length })}
      >
        {@render item(it, i)}
      </div>
    {/each}
  </div>
  {#if items.length > 1}
    <div class="buttons">
      <button type="button" class="btn btn-circle btn-sm" onclick={() => move(-1)}
        ><span aria-hidden="true">‹</span><span class="visually-hidden">{t('Previous')}</span></button
      >
      <button type="button" class="btn btn-circle btn-sm" onclick={() => move(1)}
        ><span aria-hidden="true">›</span><span class="visually-hidden">{t('Next')}</span></button
      >
    </div>
  {/if}
</section>

<style>
  .carousel {
    gap: var(--space-3);
    border-radius: var(--radius-box);
  }

  .buttons {
    display: flex;
    justify-content: center;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }
</style>
