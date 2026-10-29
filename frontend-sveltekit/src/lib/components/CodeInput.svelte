<script lang="ts">
  let {
    value = $bindable(''),
    id,
    label = 'Code',
    hint,
  }: { value?: string; id: string; label?: string; hint?: string } = $props();
</script>

<div class="field">
  <label for={id}>{label}</label>
  <input
    {id}
    class="input code"
    bind:value
    inputmode="numeric"
    autocomplete="one-time-code"
    maxlength="20"
    required
    aria-describedby={hint ? `${id}-hint` : undefined}
  />
  {#if hint}<p class="hint" id="{id}-hint">{hint}</p>{/if}
</div>
