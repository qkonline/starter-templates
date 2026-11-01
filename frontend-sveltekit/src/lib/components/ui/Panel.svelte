<!--
  A titled block of the page: a heading, an optional description and
  actions beside it, then the content. Renders a <section> named by its heading.

    <Panel title="Devices" description="Where your account is signed in."><Devices /></Panel>

  `description` takes words or a snippet (the email with its badge); `actions` sits at the
  heading's end (a "Sign out" beside "Account"). Give `id` for a link to it (`/account#email`).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  const uid = $props.id();

  let {
    title,
    description,
    actions,
    children,
    class: extra,
    ...rest
  }: Omit<HTMLAttributes<HTMLElement>, 'title'> & {
    title?: string;
    description?: string | Snippet;
    actions?: Snippet;
    children: Snippet;
  } = $props();
</script>

<section {...rest} class={['panel', extra]} aria-labelledby={title ? `${uid}-h` : undefined}>
  {#if title || actions}
    <header>
      <div class="titles">
        {#if title}<h2 id="{uid}-h">{title}</h2>{/if}
        {#if typeof description === 'string'}<p>{description}</p>
        {:else if description}<p>{@render description()}</p>{/if}
      </div>
      {#if actions}<div class="actions">{@render actions()}</div>{/if}
    </header>
  {/if}
  <div class="body stack">{@render children()}</div>
</section>

<style>
  .panel {
    min-width: 0;
    background: var(--panel-bg);
    border: 1px solid var(--panel-border);
    border-radius: var(--panel-radius);
    box-shadow: var(--panel-shadow);
    scroll-margin-top: calc(var(--header-height) + var(--space-4));
  }

  /* The title row, with the theme's rule under it (--panel-head-border; `none` for no rule). */
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2) var(--space-4);
    padding: min(var(--panel-head-padding-top), var(--panel-padding)) var(--panel-padding)
      var(--panel-head-padding-bottom);
    border-bottom: var(--panel-head-border);
  }

  .titles {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }

  h2 {
    font-size: var(--panel-title-size);
  }

  .titles p {
    color: var(--color-muted);
    font-size: var(--text-sm);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .body {
    padding: var(--panel-padding);
  }

  header + .body {
    padding-top: var(--panel-head-gap);
  }

  /* Space below, unless last; a .stack or .row replaces it with its gap (src/app.css). */
  :where(.panel) {
    margin: 0 0 var(--flow-space);
  }

  :where(.panel:last-child) {
    margin-block-end: 0;
  }

  @media (max-width: 30rem) {
    .panel {
      --panel-padding: var(--space-4);
    }
  }
</style>
