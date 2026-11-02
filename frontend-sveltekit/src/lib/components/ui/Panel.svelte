<!--
  A titled block of the page (DaisyUI's card): a heading, an optional description and
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

<section
  {...rest}
  class={['panel card card-border bg-base-100', extra]}
  aria-labelledby={title ? `${uid}-h` : undefined}
>
  <div class="card-body">
    {#if title || actions}
      <header>
        <div class="titles">
          {#if title}<h2 class="card-title" id="{uid}-h">{title}</h2>{/if}
          {#if typeof description === 'string'}<p>{description}</p>
          {:else if description}<p>{@render description()}</p>{/if}
        </div>
        {#if actions}<div class="actions">{@render actions()}</div>{/if}
      </header>
    {/if}
    <div class="body stack">{@render children()}</div>
  </div>
</section>

<style>
  .panel {
    min-width: 0;
    scroll-margin-top: calc(var(--header-height) + var(--space-4));
  }

  .card-body {
    gap: var(--space-4);
  }

  header {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2) var(--space-4);
  }

  .titles {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
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

  /* Space below, unless last; a .stack or .row replaces it with its gap (src/app.css). */
  :where(.panel) {
    margin: 0 0 var(--flow-space);
  }

  :where(.panel:last-child) {
    margin-block-end: 0;
  }

  @media (max-width: 30rem) {
    .card-body {
      padding: var(--space-4);
    }
  }
</style>
