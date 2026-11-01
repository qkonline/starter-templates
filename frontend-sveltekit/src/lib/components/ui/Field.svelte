<!--
  A labelled form control, with an optional hint under it:

    <Field label="Email" hint="We'll send a code."><Input type="email" bind:value={email} /></Field>

  The <Input>, <Select> or <Textarea> inside takes its id, aria-describedby and aria-invalid
  from here. Give `id` only when something else needs it (a test, a link to the field).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { ids, setField } from './field.ts';

  const uid = $props.id();

  let {
    label,
    id = uid,
    hint,
    invalid = false,
    describedby,
    hideLabel = false,
    children,
  }: {
    /** Words, or a snippet when they need markup (the account's email in bold). */
    label: string | Snippet;
    id?: string;
    hint?: string;
    invalid?: boolean;
    /** More ids the control is described by, e.g. the form's error. */
    describedby?: string;
    /** Keep the label for screen readers only, where the layout already says what the field is. */
    hideLabel?: boolean;
    children: Snippet;
  } = $props();

  setField({
    get id() {
      return id;
    },
    get describedby() {
      return ids(hint && `${id}-hint`, describedby);
    },
    get invalid() {
      return invalid;
    },
  });
</script>

<div class="field">
  <label class={hideLabel ? 'visually-hidden' : 'label'} for={id}
    >{#if typeof label === 'string'}{label}{:else}{@render label()}{/if}</label
  >
  {@render children()}
  {#if hint}<p class="hint" id="{id}-hint">{hint}</p>{/if}
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  /* Space below, unless last; a .stack or .row replaces it with its gap (src/app.css). */
  :where(.field) {
    margin: 0 0 var(--flow-space);
  }

  :where(.field:last-child) {
    margin-block-end: 0;
  }
</style>
