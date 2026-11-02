<script lang="ts">
  import Field from './ui/Field.svelte';
  import Input from './ui/Input.svelte';
  import { t } from '#lib/i18n/index.svelte.ts';

  let {
    value = $bindable(''),
    id,
    label,
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

<Field label={label ?? t('Password')} {id} {hint} {invalid} {describedby}>
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
        class="btn btn-ghost btn-xs show"
        aria-pressed={shown}
        aria-controls={id}
        onclick={() => (shown = !shown)}
      >
        <span aria-hidden="true">{shown ? t('Hide') : t('Show')}</span><span class="visually-hidden"
          >{shown ? t('Hide password') : t('Show password')}</span
        >
      </button>
    {/snippet}
  </Input>
</Field>

<style>
  .show {
    margin-inline-end: calc(var(--space-2) * -1);
    color: var(--color-muted);
    font-weight: var(--weight-body);
  }
</style>
