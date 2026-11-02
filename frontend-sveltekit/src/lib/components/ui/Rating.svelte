<!--
  Stars to give or show a score (DaisyUI's rating): radio buttons underneath, so arrow keys move
  between them. `readonly` shows the score without letting it change.

    <Rating legend="Your rating" bind:value={stars} />
-->
<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';

  const uid = $props.id();

  let {
    legend,
    value = $bindable(0),
    max = 5,
    readonly = false,
    size = 'md',
    name = uid,
    onchange,
  }: {
    legend: string;
    /** 0 is none given yet. */
    value?: number;
    max?: number;
    readonly?: boolean;
    size?: 'xs' | 'sm' | 'md' | 'lg';
    name?: string;
    onchange?: (value: number) => void;
  } = $props();

  // Written out in full: Tailwind builds only the class names it finds in the source.
  const sizes = { xs: 'rating-xs', sm: 'rating-sm', md: '', lg: 'rating-lg' };
  const stars = $derived(Array.from({ length: max }, (_, i) => i + 1));
</script>

{#if readonly}
  <div class={['rating', sizes[size]]} role="img" aria-label={t('{n} of {max} stars', { n: value, max })}>
    {#each stars as n (n)}
      <div class="mask mask-star-2 star" aria-hidden="true" aria-current={n === value || undefined}></div>
    {/each}
  </div>
{:else}
  <fieldset class={['rating', sizes[size]]}>
    <legend class="visually-hidden">{legend}</legend>
    <input
      type="radio"
      {name}
      class="rating-hidden"
      aria-label={t('No stars')}
      checked={value === 0}
      onchange={() => {
        value = 0;
        onchange?.(0);
      }}
    />
    {#each stars as n (n)}
      <input
        type="radio"
        {name}
        class="mask mask-star-2 star"
        aria-label={t('{n} of {max} stars', { n, max })}
        checked={value === n}
        onchange={() => {
          value = n;
          onchange?.(n);
        }}
      />
    {/each}
  </fieldset>
{/if}

<style>
  .star {
    background-color: var(--color-star);
  }
</style>
