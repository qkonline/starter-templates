<!--
  A button, or a link that looks like one when given `href`. Anything else (type, disabled,
  onclick, aria-…) goes straight to the element; `ref` binds it, for focus.

    <Button variant="primary" type="submit">Save</Button>
    <Button href={resolve('account')} size="small">Account</Button>

  A parent restyling one (its colour in a banner) reaches it with `.parent :global(.btn)`.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

  type Variant = 'plain' | 'primary' | 'danger' | 'danger-solid' | 'link';

  type Props = {
    variant?: Variant;
    size?: 'md' | 'small';
    /** The full width of its container. */
    wide?: boolean;
    ref?: HTMLElement;
    children: Snippet;
  } & (({ href: string } & HTMLAnchorAttributes) | ({ href?: undefined } & HTMLButtonAttributes));

  let {
    variant = 'plain',
    size = 'md',
    wide = false,
    ref = $bindable(),
    children,
    class: extra,
    ...rest
  }: Props = $props();

  const classes = $derived(['btn', variant, { small: size === 'small', wide }, extra]);
</script>

{#if rest.href !== undefined}
  <a bind:this={ref} {...rest as HTMLAnchorAttributes} class={classes}>{@render children()}</a>
{:else}
  <button bind:this={ref} {...rest as HTMLButtonAttributes} class={classes}>{@render children()}</button>
{/if}

<style>
  /* Every size, colour, border and weight here is a theme token (src/lib/themes/). */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-height: var(--control-height);
    padding: 0 var(--button-padding-x);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: var(--button-weight);
    line-height: 1.2;
    text-decoration: none;
    white-space: nowrap;
    color: var(--button-plain-text);
    background: var(--button-plain-bg);
    border: 1px solid var(--button-plain-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      background-color 160ms cubic-bezier(0.2, 0, 0, 1),
      border-color 160ms cubic-bezier(0.2, 0, 0, 1),
      color 160ms cubic-bezier(0.2, 0, 0, 1);
  }

  .btn:hover {
    color: var(--button-plain-hover-text);
    background: var(--button-plain-hover-bg);
    border-color: var(--button-plain-hover-border);
    text-decoration: none;
  }

  .btn:active:not(:disabled) {
    transform: translateY(1px);
  }

  .btn:disabled,
  .btn[aria-disabled='true'] {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .primary,
  .primary:hover {
    color: var(--color-primary-text);
    background: var(--color-primary);
    border-color: var(--color-primary);
    box-shadow: var(--button-primary-shadow);
  }

  .primary:hover:not(:disabled) {
    background: var(--color-primary-hover);
    border-color: var(--color-primary-hover);
  }

  .danger,
  .danger:hover {
    color: var(--button-danger-text);
    background: var(--button-danger-bg);
    border-color: var(--button-danger-border);
  }

  .danger:hover:not(:disabled) {
    background: var(--button-danger-hover-bg);
  }

  .danger-solid,
  .danger-solid:hover {
    color: var(--color-on-danger);
    background: var(--color-danger);
    border-color: var(--color-danger);
  }

  .danger-solid:hover:not(:disabled) {
    filter: brightness(1.08);
  }

  .wide {
    width: 100%;
  }

  .link,
  .link:hover {
    min-height: auto;
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-link);
    font-weight: var(--weight-body);
  }

  .link:hover {
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }

  .small {
    min-height: var(--control-height-sm);
    padding: 0 var(--space-3);
    font-size: var(--text-sm);
  }

  @media (prefers-reduced-motion: reduce) {
    .btn:active:not(:disabled) {
      transform: none;
    }
  }
</style>
