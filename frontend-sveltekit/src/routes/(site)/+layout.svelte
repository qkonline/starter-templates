<!-- Public pages: built with their content, readable without JavaScript. -->
<script lang="ts">
  import { resolve } from '$app/paths';
  import { appName } from '#lib/config.ts';

  let { children } = $props();
</script>

<div class="site">
  <header class="bar">
    <a class="brand" href={resolve('')}>{appName}</a>
    <nav aria-label="Account">
      <a href={resolve('signin')}>Sign in</a>
      <a class="btn small primary" href={resolve('signup')}>Create account</a>
    </nav>
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

  .bar {
    width: 100%;
    max-width: var(--page-width);
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
    font-weight: 650;
    letter-spacing: var(--tracking-tight);
    color: var(--color-text);
    text-decoration: none;
  }

  main {
    flex: 1;
    width: 100%;
    max-width: var(--page-width);
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
