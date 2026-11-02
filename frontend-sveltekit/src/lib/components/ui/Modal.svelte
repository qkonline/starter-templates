<!--
  A dialog over the page (DaisyUI's modal, on <dialog>): a title, the content, and actions at
  its foot. Escape, the ✕ and a click outside close it; focus goes in when it opens and back
  when it closes (the browser does both).

    <Modal title="Rename team" bind:open>
      <Field label="Name"><Input bind:value={name} /></Field>
      {#snippet actions()}<Button variant="primary" onclick={save}>Save</Button>{/snippet}
    </Modal>
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '#lib/i18n/index.svelte.ts';

  const uid = $props.id();

  let {
    title,
    open = $bindable(false),
    wide = false,
    dismissible = true,
    onclose,
    actions,
    children,
  }: {
    title: string;
    open?: boolean;
    wide?: boolean;
    /** False keeps it open on Escape and outside clicks (an unsaved form). */
    dismissible?: boolean;
    onclose?: () => void;
    actions?: Snippet;
    children: Snippet;
  } = $props();

  let dialog: HTMLDialogElement;

  $effect(() => {
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });

  function closed() {
    open = false;
    onclose?.();
  }
</script>

<dialog
  bind:this={dialog}
  class="modal"
  aria-labelledby="{uid}-title"
  onclose={closed}
  oncancel={(e) => {
    if (!dismissible) e.preventDefault();
  }}
>
  <div class={['modal-box', { 'max-w-3xl': wide }]}>
    <header>
      <h2 id="{uid}-title">{title}</h2>
      <button type="button" class="btn btn-ghost btn-sm btn-square" onclick={() => (open = false)}
        ><span aria-hidden="true">✕</span><span class="visually-hidden">{t('Close')}</span></button
      >
    </header>
    <div class="stack">{@render children()}</div>
    {#if actions}<div class="modal-action">{@render actions()}</div>{/if}
  </div>
  {#if dismissible}
    <form method="dialog" class="modal-backdrop"><button tabindex="-1">{t('Close')}</button></form>
  {/if}
</dialog>

<style>
  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
    margin-bottom: var(--space-4);
  }

  .modal-box {
    border: var(--border) solid var(--color-base-300);
  }
</style>
