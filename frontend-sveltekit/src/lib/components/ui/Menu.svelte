<!--
  A list of links or actions (DaisyUI's menu): in a <Dropdown>, a side bar, a <Drawer>.
  <Menu><li><a href=…>Profile</a></li><li><button …>Sign out</button></li></Menu>.
  `title` heads a group: <li class="menu-title">Team</li>; `menu-active` marks this page's link.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  let {
    horizontal = false,
    size = 'md',
    children,
    class: extra,
    ...rest
  }: HTMLAttributes<HTMLUListElement> & {
    horizontal?: boolean;
    size?: 'xs' | 'sm' | 'md' | 'lg';
    children: Snippet;
  } = $props();

  // Written out in full: Tailwind builds only the class names it finds in the source.
  const sizes = { xs: 'menu-xs', sm: 'menu-sm', md: '', lg: 'menu-lg' };
</script>

<ul {...rest} class={['menu', sizes[size], { 'menu-horizontal': horizontal, 'w-full': !horizontal }, extra]}>
  {@render children()}
</ul>

<style>
  /* Links in a menu look like its items, not like links in a sentence. */
  .menu :global(a:not(.menu-active)) {
    color: inherit;
    text-decoration: none;
  }
</style>
