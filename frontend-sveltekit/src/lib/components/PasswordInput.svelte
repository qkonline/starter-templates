<script lang="ts">
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

<div class="field">
  <label for={id}>{label}</label>
  <div class="wrap">
    <input
      {id}
      class="input"
      type={shown ? 'text' : 'password'}
      bind:value
      {autocomplete}
      autocapitalize="off"
      spellcheck="false"
      required
      aria-invalid={invalid}
      aria-describedby={[hint ? `${id}-hint` : '', describedby ?? ''].join(' ').trim() || undefined}
    />
    <button
      type="button"
      class="toggle"
      aria-pressed={shown}
      aria-controls={id}
      onclick={() => (shown = !shown)}
    >
      {shown ? 'Hide' : 'Show'}<span class="visually-hidden"> password</span>
    </button>
  </div>
  {#if hint}<p class="hint" id="{id}-hint">{hint}</p>{/if}
</div>

<style>
  .wrap {
    position: relative;
  }

  .wrap .input {
    padding-right: 4.5rem;
  }

  .toggle {
    position: absolute;
    right: 0.25rem;
    top: 50%;
    transform: translateY(-50%);
    min-height: 2.25rem;
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
