<!--
  A button that asks before doing something that can't be undone: the first tap shows the
  question and the real button beside it; the second does it. Focus follows: to what's asked
  for (the first field, or else the confirm button) when asking, back to the first button after.
-->
<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import Button from './ui/Button.svelte';

  let {
    label,
    confirmLabel,
    question,
    danger = true,
    disabled = false,
    size = 'small',
    onconfirm,
    children,
  }: {
    /** The first button's words, e.g. "Remove". */
    label: string;
    /** The second's, e.g. "Remove Ada". */
    confirmLabel: string;
    question: string;
    danger?: boolean;
    disabled?: boolean;
    /** Small in list rows (the default); full size beside other full-size buttons. */
    size?: 'md' | 'small';
    onconfirm: () => void;
    /** Anything to ask for before confirming (a reason, a typed name). */
    children?: Snippet;
  } = $props();

  let asking = $state(false);
  let opener = $state<HTMLElement>();
  let ask = $state<HTMLDivElement>();
  let confirmer = $state<HTMLElement>();

  async function open() {
    asking = true;
    await tick();
    const field = ask?.querySelector<HTMLElement>('input, select, textarea');
    (field ?? confirmer)?.focus();
  }

  async function close() {
    asking = false;
    await tick();
    opener?.focus();
  }
</script>

{#if !asking}
  <Button
    bind:ref={opener}
    type="button"
    {size}
    variant={danger ? 'danger' : 'plain'}
    {disabled}
    onclick={open}>{label}</Button
  >
{:else}
  <div bind:this={ask} class="ask" role="group" aria-label={question}>
    <p class="small">{question}</p>
    {@render children?.()}
    <div class="row">
      <Button
        bind:ref={confirmer}
        type="button"
        {size}
        variant={danger ? 'danger-solid' : 'plain'}
        {disabled}
        onclick={() => {
          close();
          onconfirm();
        }}>{confirmLabel}</Button
      >
      <Button type="button" {size} onclick={close}>Cancel</Button>
    </div>
  </div>
{/if}

<style>
  .ask {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-sunken);
    max-width: 22rem;
  }

  .row {
    gap: var(--space-2);
  }
</style>
