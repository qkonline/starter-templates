<!-- The signed-in home: replace with the app's own content. -->
<script lang="ts">
  import { resolve } from '$app/paths';
  import { appName } from '#lib/config.ts';
  import { auth } from '#lib/session.svelte.ts';
  import Trans from '#lib/components/Trans.svelte';
  import { msg, t } from '#lib/i18n/index.svelte.ts';

  const user = $derived(auth.user!);
</script>

<svelte:head><title>{t('Home')} · {appName}</title></svelte:head>

<div class="stack">
  <h1>{user.name ? t('Hello, {name}.', { name: user.name }) : t('Hello.')}</h1>
  <p class="muted">
    <Trans
      text={msg(
        'This is where {app}’s own pages go. Everything under <code>{path}</code> is behind sign-in.',
      )}
      vars={{ app: appName, path: 'src/routes/(app)/' }}
    >
      {#snippet code(s: string)}<code>{s}</code>{/snippet}
    </Trans>
  </p>
  <p><a href={resolve('account')}>{t('Your account')}</a></p>
</div>

<style>
  code {
    font-family: var(--font-mono);
    font-size: 0.92em;
  }
</style>
