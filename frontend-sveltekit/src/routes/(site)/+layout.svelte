<!-- Public pages: built with their content, readable without JavaScript. -->
<script lang="ts">
  import { resolve } from '$app/paths';
  import { appName } from '#lib/config.ts';
  import Button from '#lib/components/ui/Button.svelte';

  let { children } = $props();
</script>

<div class="site">
  <header class="top">
    <div class="bar">
      <a class="brand" href={resolve('')}><span class="logo" aria-hidden="true"></span>{appName}</a>
      <nav aria-label="Account">
        <a href={resolve('signin')}>Sign in</a>
        <Button variant="primary" size="small" href={resolve('signup')}>Create account</Button>
      </nav>
    </div>
  </header>

  <main id="main">
    {@render children()}
  </main>

  <footer class="bar muted small">
    <span>© {new Date().getFullYear()} {appName}</span>
    <nav aria-label="Legal">
      <a href={resolve('contact')}>Contact</a>
      <a href={resolve('privacy')}>Privacy</a>
      <a href={resolve('terms')}>Terms</a>
    </nav>
  </footer>
</div>

<style>
  .site {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
  }

  .top {
    background: var(--header-bg);
    border-bottom: 1px solid var(--header-border);
    box-shadow: var(--header-shadow);
  }

  .top .bar {
    min-height: var(--header-height);
    padding-block: 0;
  }

  .bar {
    width: 100%;
    max-width: calc(var(--page-width) + 2 * var(--space-4));
    margin: 0 auto;
    padding: var(--space-4);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
  }

  nav {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-weight: var(--weight-heading);
    color: var(--color-heading);
    text-decoration: none;
  }

  .logo {
    width: 1.25rem;
    height: 1.25rem;
    border-radius: var(--radius-sm);
    background: var(--color-accent);
  }

  nav a:not(:global(.btn)) {
    font-size: var(--text-sm);
    color: var(--color-text);
  }

  main {
    flex: 1;
    width: 100%;
    max-width: calc(var(--page-width) + 2 * var(--space-4));
    margin: 0 auto;
    padding: var(--space-6) var(--space-4) var(--space-8);
  }

  footer {
    border-top: 1px solid var(--color-border);
  }

  footer a {
    color: inherit;
  }
</style>
