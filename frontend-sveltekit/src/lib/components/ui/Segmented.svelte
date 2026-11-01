<!--
  One choice out of a few, side by side (theme, text size, a filter). Radio buttons underneath,
  so arrow keys move between them and a screen reader hears a group:

    <Segmented legend="Text size" options={textSizes} bind:value={text} onchange={save} />
-->
<script lang="ts" generics="T extends string">
  const uid = $props.id();

  let {
    legend,
    options,
    value = $bindable(),
    name = uid,
    hideLegend = false,
    onchange,
  }: {
    legend: string;
    options: readonly { value: T; label: string }[];
    /** Nothing chosen yet when undefined. */
    value: T | undefined;
    name?: string;
    /** For screen readers only, where the layout already says what the choice is. */
    hideLegend?: boolean;
    onchange?: (value: T) => void;
  } = $props();
</script>

<fieldset>
  <legend class={hideLegend ? 'visually-hidden' : 'label'}>{legend}</legend>
  <div class="segmented">
    {#each options as o (o.value)}
      <label>
        <input
          type="radio"
          {name}
          value={o.value}
          checked={value === o.value}
          onchange={() => {
            value = o.value;
            onchange?.(o.value);
          }}
        />{o.label}
      </label>
    {/each}
  </div>
</fieldset>

<style>
  fieldset {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: 0;
    border: 0;
    min-width: 0;
  }

  legend {
    margin-bottom: var(--space-2);
    padding: 0;
  }

  .segmented {
    display: inline-flex;
    flex-wrap: wrap;
    align-self: flex-start;
    padding: 2px;
    gap: 2px;
    border: 1px solid var(--segmented-track-border);
    border-radius: var(--radius-sm);
    background: var(--segmented-track-bg);
  }

  label {
    display: inline-flex;
    align-items: center;
    min-height: calc(var(--control-height) - 6px);
    padding: 0 var(--space-3);
    border-radius: calc(var(--radius-sm) - 2px);
    color: var(--segmented-text);
    font-size: var(--text-sm);
    font-weight: var(--button-weight);
    cursor: pointer;
    transition:
      background-color 160ms cubic-bezier(0.2, 0, 0, 1),
      color 160ms cubic-bezier(0.2, 0, 0, 1);
  }

  label:hover {
    color: var(--color-heading);
  }

  input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  label:has(input:checked) {
    background: var(--segmented-selected-bg);
    color: var(--segmented-selected-text);
    box-shadow: var(--segmented-selected-shadow);
  }

  label:has(input:focus-visible) {
    outline: 2px solid var(--color-focus);
    outline-offset: 1px;
  }

  /* Space below, unless last; a .stack or .row replaces it with its gap (src/app.css). */
  :where(fieldset) {
    margin: 0 0 var(--flow-space);
  }

  :where(fieldset:last-child) {
    margin-block-end: 0;
  }
</style>
