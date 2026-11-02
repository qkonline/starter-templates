<!--
  How far something has got (DaisyUI's progress). Without `value` it moves without end: under
  way, how far not known. `label` names it for screen readers.

    <Progress label="Uploading" value={sent} max={total} />
-->
<script lang="ts">
  let {
    label,
    value,
    max = 100,
    tone = 'primary',
  }: {
    label: string;
    value?: number;
    max?: number;
    tone?: 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'error' | 'info' | 'neutral';
  } = $props();

  // Written out in full: Tailwind builds only the class names it finds in the source.
  const tones = {
    primary: 'progress-primary',
    secondary: 'progress-secondary',
    accent: 'progress-accent',
    success: 'progress-success',
    warning: 'progress-warning',
    error: 'progress-error',
    info: 'progress-info',
    neutral: 'progress-neutral',
  };
</script>

<progress class={['progress w-full', tones[tone]]} aria-label={label} {value} {max}></progress>
