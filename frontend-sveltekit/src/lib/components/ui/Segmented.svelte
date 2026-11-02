<!--
  One choice out of a few, side by side (theme, text size, a filter): DaisyUI's join of buttons
  with radio buttons underneath, so arrow keys move between them and a screen reader hears a
  group:

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

<fieldset class="fieldset segmented">
  <legend class={hideLegend ? 'visually-hidden' : 'fieldset-legend'}>{legend}</legend>
  <!-- DaisyUI's join of buttons, each a label around its radio, so the words are on the page. -->
  <div class="join">
    {#each options as o (o.value)}
      <label class="join-item btn has-checked:btn-primary">
        <input
          class="visually-hidden"
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
  .segmented {
    padding: 0;
  }

  .fieldset-legend {
    padding-block: 0 var(--space-1);
  }

  .join {
    flex-wrap: wrap;
  }

  label {
    position: relative;
  }

  /* The radio is hidden, so its label shows where focus is. */
  label:has(:focus-visible) {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
    z-index: 1;
  }

  /* Space below, unless last; a .stack or .row replaces it with its gap (src/app.css). */
  :where(.segmented) {
    margin: 0 0 var(--flow-space);
  }

  :where(.segmented:last-child) {
    margin-block-end: 0;
  }
</style>
