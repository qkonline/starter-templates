<!-- A form's button: says what's happening while busy, and how long to wait after `rate_limited`. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Task } from '#lib/task.svelte.ts';
  import Spinner from './Spinner.svelte';
  import Button from './ui/Button.svelte';

  let {
    task,
    busyLabel,
    variant = 'primary',
    wide = true,
    type = 'submit',
    onclick,
    children,
  }: {
    task: Task;
    busyLabel?: string;
    variant?: 'primary' | 'plain' | 'danger';
    wide?: boolean;
    type?: 'submit' | 'button';
    onclick?: () => void;
    children: Snippet;
  } = $props();
</script>

<Button
  {type}
  {variant}
  {wide}
  aria-disabled={task.blocked}
  aria-busy={task.busy}
  onclick={(e: MouseEvent) => {
    if (task.blocked) e.preventDefault();
    else onclick?.();
  }}
>
  {#if task.busy}
    <Spinner />{busyLabel ?? 'Working…'}
  {:else if task.wait > 0}
    Try again in {task.wait} s
  {:else}
    {@render children()}
  {/if}
</Button>
