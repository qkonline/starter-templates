<!--
  Things that happened, in order, on a line (DaisyUI's timeline): an order's history, an
  account's activity.

    <Timeline items={[{ when: '9:02', title: 'Ordered' }, { when: '11:40', title: 'Sent', done: false }]} />
-->
<script lang="ts">
  let {
    items,
    horizontal = false,
  }: {
    items: readonly { when?: string; title: string; text?: string; done?: boolean }[];
    horizontal?: boolean;
  } = $props();
</script>

<ul class={['timeline flow', horizontal ? 'timeline-horizontal' : 'timeline-vertical timeline-compact']}>
  {#each items as item, i (i)}
    {@const done = item.done ?? true}
    <li>
      {#if i > 0}<hr class={{ 'bg-primary': done }} />{/if}
      {#if item.when}<div class="timeline-start when">{item.when}</div>{/if}
      <div class="timeline-middle">
        <span class={['dot', { done }]} aria-hidden="true"></span>
      </div>
      <div class="timeline-end timeline-box">
        <div class="title">{item.title}</div>
        {#if item.text}<div class="text">{item.text}</div>{/if}
      </div>
      {#if i < items.length - 1}<hr class={{ 'bg-primary': items[i + 1]?.done ?? true }} />{/if}
    </li>
  {/each}
</ul>

<style>
  .dot {
    display: block;
    width: 0.75rem;
    height: 0.75rem;
    border-radius: var(--radius-full);
    border: 2px solid var(--color-base-300);
    background: var(--color-base-100);
  }

  .dot.done {
    border-color: var(--color-primary);
    background: var(--color-primary);
  }

  .when,
  .text {
    font-size: var(--text-sm);
    color: var(--color-muted);
  }

  .title {
    font-weight: var(--weight-medium);
    color: var(--color-heading);
  }

  .timeline-box {
    box-shadow: none;
  }
</style>
