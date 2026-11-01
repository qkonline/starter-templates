<script lang="ts">
  import Field from './ui/Field.svelte';
  import Input from './ui/Input.svelte';

  let {
    value = $bindable(''),
    id,
    label = 'Code',
    hint,
  }: { value?: string; id: string; label?: string; hint?: string } = $props();
</script>

<Field {label} {id} {hint}>
  <Input code bind:value inputmode="numeric" autocomplete="one-time-code" maxlength={20} required />
</Field>
