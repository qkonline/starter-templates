<!--
  A small coloured dot for a state (DaisyUI's status): online, failing, paused. `label` says it
  in words for screen readers; show the words beside it too when colour alone would be the only
  sign.

    <Status tone="success" label="Online" />
-->
<script lang="ts">
  type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'error' | 'info';

  let {
    tone = 'neutral',
    label,
    size = 'md',
    pulse = false,
  }: { tone?: Tone; label: string; size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; pulse?: boolean } = $props();

  // Written out in full: Tailwind builds only the class names it finds in the source.
  const tones = {
    neutral: 'status-neutral',
    primary: 'status-primary',
    success: 'status-success',
    warning: 'status-warning',
    error: 'status-error',
    info: 'status-info',
  };
  const sizes = { xs: 'status-xs', sm: 'status-sm', md: 'status-md', lg: 'status-lg', xl: 'status-xl' };
</script>

<span class={['status', tones[tone], sizes[size], { 'animate-pulse': pulse }]} role="img" aria-label={label}
></span>
