<!--
  One message in a conversation (DaisyUI's chat): theirs on the start side, yours on the end,
  with who and when above it.

    <ChatBubble name="Ada" time="9:02" side="start">Is the ward round at ten?</ChatBubble>
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    side = 'start',
    name,
    time,
    footer,
    avatar,
    tone,
    children,
  }: {
    side?: 'start' | 'end';
    name?: string;
    time?: string;
    /** Under the bubble: "Seen", "Sending…". */
    footer?: string;
    avatar?: Snippet;
    tone?: 'primary' | 'neutral';
    children: Snippet;
  } = $props();

  // Written out in full: Tailwind builds only the class names it finds in the source.
  const tones = { primary: 'chat-bubble-primary', neutral: 'chat-bubble-neutral' };
</script>

<div class={['chat', side === 'end' ? 'chat-end' : 'chat-start']}>
  {#if avatar}<div class="chat-image">{@render avatar()}</div>{/if}
  {#if name || time}
    <div class="chat-header">
      {name}
      {#if time}<time class="when">{time}</time>{/if}
    </div>
  {/if}
  <div class={['chat-bubble', tone && tones[tone]]}>{@render children()}</div>
  {#if footer}<div class="chat-footer when">{footer}</div>{/if}
</div>

<style>
  .when {
    font-size: var(--text-xs);
    color: var(--color-muted);
  }
</style>
