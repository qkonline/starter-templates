<!-- The signed-in home: replace with the app's own content. -->
<script lang="ts">
  import { resolve } from '$app/paths';
  import { appName } from '#lib/config.ts';
  import { auth } from '#lib/session.svelte.ts';

  const user = $derived(auth.user!);
</script>

<svelte:head><title>Home · {appName}</title></svelte:head>

<div class="stack">
  <h1>Hello{user.name ? `, ${user.name}` : ''}.</h1>
  <p class="muted">
    This is where {appName}’s own pages go. Everything under <code>src/routes/(app)/</code> is behind sign-in.
  </p>
  <p><a href={resolve('account')}>Your account</a></p>
</div>

<style>
  code {
    font-family: var(--font-mono);
    font-size: 0.92em;
  }
</style>
