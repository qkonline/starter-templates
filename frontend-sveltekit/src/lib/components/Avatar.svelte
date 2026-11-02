<!-- A person's photo, or the first letter of their name (DaisyUI's avatar), `size` px across. -->
<script lang="ts">
  import type { User } from '#lib/api/index.ts';

  let { user, size = 40 }: { user: Pick<User, 'name' | 'email' | 'photoUrl'>; size?: number } = $props();

  const initial = $derived((user.name || user.email).trim().charAt(0).toUpperCase());
</script>

<span class={['avatar', { 'avatar-placeholder': !user.photoUrl }]} aria-hidden="true">
  <span class="face" style:width="{size}px" style:height="{size}px" style:font-size="{size * 0.42}px">
    {#if user.photoUrl}
      <img src={user.photoUrl} alt="" width={size} height={size} />
    {:else}
      {initial}
    {/if}
  </span>
</span>

<style>
  .face {
    display: inline-grid;
    place-items: center;
    overflow: hidden;
    border-radius: var(--radius-full);
    background: var(--color-accent-soft);
    color: var(--color-primary);
    font-weight: var(--weight-medium);
    box-shadow: inset 0 0 0 1px var(--color-base-300);
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
