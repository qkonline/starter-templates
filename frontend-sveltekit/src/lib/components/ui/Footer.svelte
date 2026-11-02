<!--
  The foot of a public page (DaisyUI's footer): groups of links side by side, one under another
  on a narrow screen. Each group is a <nav> with a title.

    <Footer groups={[{ title: 'Legal', links: [{ label: 'Privacy', href: resolve('privacy') }] }]} />
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    groups = [],
    children,
  }: {
    groups?: readonly { title: string; links: readonly { label: string; href: string }[] }[];
    /** Anything after the groups: a line about the company, a copyright. */
    children?: Snippet;
  } = $props();
</script>

<footer class="footer sm:footer-horizontal">
  {#each groups as group (group.title)}
    <nav aria-label={group.title}>
      <h2 class="footer-title">{group.title}</h2>
      {#each group.links as link (link.href)}<a class="link link-hover" href={link.href}>{link.label}</a
        >{/each}
    </nav>
  {/each}
  {#if children}<div>{@render children()}</div>{/if}
</footer>

<style>
  .footer {
    padding-block: var(--space-6);
    color: var(--color-muted);
  }

  .footer-title {
    font-size: var(--text-sm);
  }

  a {
    color: inherit;
  }
</style>
