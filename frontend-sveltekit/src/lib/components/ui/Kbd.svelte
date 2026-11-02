<!-- A key to press, as on the keyboard (DaisyUI's kbd): <Kbd>Ctrl</Kbd> + <Kbd>K</Kbd>. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { size = 'sm', children }: { size?: 'xs' | 'sm' | 'md' | 'lg'; children: Snippet } = $props();

  // Written out in full: Tailwind builds only the class names it finds in the source.
  const sizes = { xs: 'kbd-xs', sm: 'kbd-sm', md: '', lg: 'kbd-lg' };
</script>

<kbd class={['kbd', sizes[size]]}>{@render children()}</kbd>
