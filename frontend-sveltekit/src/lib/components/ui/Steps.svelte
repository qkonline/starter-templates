<!--
  Where someone is in a series of steps (DaisyUI's steps): those done and this one coloured.

    <Steps steps={['Account', 'Team', 'Invite']} current={1} />
-->
<script lang="ts">
  let {
    steps,
    current = 0,
    vertical = false,
  }: {
    steps: readonly string[];
    /** The step they're on, from 0. */
    current?: number;
    vertical?: boolean;
  } = $props();
</script>

<ol class={['steps flow', { 'steps-vertical': vertical }]}>
  {#each steps as step, i (i)}
    <li class={['step', { 'step-primary': i <= current }]} aria-current={i === current ? 'step' : undefined}>
      {step}
    </li>
  {/each}
</ol>

<style>
  .steps {
    width: 100%;
    font-size: var(--text-sm);
  }
</style>
