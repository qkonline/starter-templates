<script lang="ts">
  import Field from './ui/Field.svelte';
  import Input from './ui/Input.svelte';

  let {
    value = $bindable(''),
    id,
    label = 'Password',
    autocomplete = 'current-password',
    hint,
    invalid = false,
    describedby,
  }: {
    value?: string;
    id: string;
    label?: string;
    autocomplete?: 'current-password' | 'new-password';
    hint?: string;
    invalid?: boolean;
    describedby?: string;
  } = $props();

  let shown = $state(false);
</script>

<Field {label} {id} {hint} {invalid} {describedby}>
  <Input
    type={shown ? 'text' : 'password'}
    bind:value
    {autocomplete}
    autocapitalize="off"
    spellcheck="false"
    required
  >
    {#snippet end()}
      <button
        type="button"
        class="toggle"
        aria-pressed={shown}
        aria-controls={id}
        onclick={() => (shown = !shown)}
      >
        {shown ? 'Hide' : 'Show'}<span class="visually-hidden"> password</span>
      </button>
    {/snippet}
  </Input>
</Field>

<style>
  .toggle {
    min-height: var(--control-height-sm);
    padding: 0 var(--space-3);
    font: inherit;
    font-size: var(--text-sm);
    color: var(--color-muted);
    background: none;
    border: 0;
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .toggle:hover {
    color: var(--color-text);
  }
</style>
