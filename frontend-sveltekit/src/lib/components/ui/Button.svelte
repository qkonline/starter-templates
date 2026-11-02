<!--
  A button, or a link that looks like one when given `href`. Anything else (type, disabled,
  onclick, aria-…) goes straight to the element; `ref` binds it, for focus.

    <Button variant="primary" type="submit">Save</Button>
    <Button href={resolve('account')} size="small">Account</Button>

  Variants: plain (grey), primary, danger (outlined red), danger-solid, link, and DaisyUI's
  outline, soft, ghost and dash (in the primary colour; `ghost` in none). Sizes xs, small, md,
  lg. A parent restyling one (its colour in a banner) reaches it with `.parent :global(.btn)`.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

  type Variant =
    'plain' | 'primary' | 'danger' | 'danger-solid' | 'link' | 'outline' | 'soft' | 'ghost' | 'dash';

  type Props = {
    variant?: Variant;
    size?: 'xs' | 'small' | 'md' | 'lg';
    /** The full width of its container. */
    wide?: boolean;
    /** Square, for an icon alone (give it an aria-label). */
    square?: boolean;
    ref?: HTMLElement;
    children: Snippet;
  } & (({ href: string } & HTMLAnchorAttributes) | ({ href?: undefined } & HTMLButtonAttributes));

  let {
    variant = 'plain',
    size = 'md',
    wide = false,
    square = false,
    ref = $bindable(),
    children,
    class: extra,
    ...rest
  }: Props = $props();

  const variants: Record<Variant, string> = {
    plain: '',
    primary: 'btn-primary',
    danger: 'btn-outline btn-error',
    'danger-solid': 'btn-error',
    link: 'btn-link',
    outline: 'btn-outline btn-primary',
    soft: 'btn-soft btn-primary',
    ghost: 'btn-ghost',
    dash: 'btn-dash',
  };
  const sizes = { xs: 'btn-xs', small: 'btn-sm', md: '', lg: 'btn-lg' };

  const classes = $derived([
    'btn',
    variants[variant],
    sizes[size],
    { 'btn-block': wide, 'btn-square': square },
    extra,
  ]);
</script>

{#if rest.href !== undefined}
  <a bind:this={ref} {...rest as HTMLAnchorAttributes} class={classes}>{@render children()}</a>
{:else}
  <button bind:this={ref} {...rest as HTMLButtonAttributes} class={classes}>{@render children()}</button>
{/if}

<style>
  /* The link variant sits in a line of text: no button height, padding or weight of its own. */
  :global(.btn.btn-link) {
    height: auto;
    min-height: 0;
    padding: 0;
    border: 0;
    vertical-align: baseline;
    font-size: inherit;
    font-weight: inherit;
  }
</style>
