<!-- A short label beside a name: "This device", "Admin", "Unconfirmed" (DaisyUI's badge, soft). -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  type Tone = 'accent' | 'danger' | 'plain' | 'success' | 'warning' | 'info' | 'neutral' | 'outline';

  let { tone = 'accent', children }: { tone?: Tone; children: Snippet } = $props();

  const tones: Record<Tone, string> = {
    accent: 'badge-soft badge-primary',
    danger: 'badge-soft badge-error',
    plain: '',
    success: 'badge-soft badge-success',
    warning: 'badge-soft badge-warning',
    info: 'badge-soft badge-info',
    neutral: 'badge-neutral',
    outline: 'badge-outline badge-primary',
  };
</script>

<span class={['badge badge-sm', tones[tone]]}>{@render children()}</span>

<style>
  .badge {
    margin-inline-start: var(--space-2);
    vertical-align: middle;
  }
</style>
