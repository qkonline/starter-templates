<script lang="ts">
  import type { User } from '#lib/api/index.ts';

  let { user, size = 40 }: { user: Pick<User, 'name' | 'email' | 'photoUrl'>; size?: number } = $props();

  const initial = $derived((user.name || user.email).trim().charAt(0).toUpperCase());
</script>

<span class="avatar" style:--size="{size}px" aria-hidden="true">
  {#if user.photoUrl}
    <img src={user.photoUrl} alt="" width={size} height={size} />
  {:else}
    {initial}
  {/if}
</span>

<style>
  .avatar {
    display: inline-grid;
    place-items: center;
    width: var(--size);
    height: var(--size);
    flex: none;
    overflow: hidden;
    border-radius: var(--radius-full);
    background: var(--color-accent-soft);
    color: var(--color-accent);
    font-weight: var(--weight-medium);
    font-size: calc(var(--size) * 0.42);
    box-shadow: inset 0 0 0 1px var(--color-border);
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
