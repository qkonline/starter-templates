<script lang="ts">
  import Field from './ui/Field.svelte';
  import Input from './ui/Input.svelte';
  import { t } from '#lib/i18n/index.svelte.ts';

  let {
    value = $bindable(''),
    id,
    label,
    hint,
  }: { value?: string; id: string; label?: string; hint?: string } = $props();
</script>

<Field label={label ?? t('Code')} {id} {hint}>
  <Input code bind:value inputmode="numeric" autocomplete="one-time-code" maxlength={20} required />
</Field>
