<script lang="ts">
  import { appName } from '#lib/config.ts';
</script>

<svelte:head><title>Privacy · {appName}</title></svelte:head>

<article class="prose">
  <h1>Privacy</h1>
  <p class="muted">Placeholder: replace with the app’s privacy policy before launch.</p>
  <h2>What we keep</h2>
  <p>
    Your email address, your name and photo if you add them, a hash of a key made from your password (never
    the password itself), your passkeys’ public keys, and the devices you’re signed in on.
  </p>
  <h2>Your choices</h2>
  <p>You can download everything we store about you, or delete your account, from your account page.</p>
</article>

<style>
  .prose {
    max-width: 38rem;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .prose h2 {
    margin-top: var(--space-4);
  }
</style>
