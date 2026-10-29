<!--
  Turnstile, rendered where a form needs it. Render only when /auth/methods names a CAPTCHA;
  then call `token()` once per submission: each token works once, so the widget makes a new one.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { loadTurnstile, TokenQueue, type Turnstile } from '#lib/captcha.ts';

  let { siteKey, action }: { siteKey: string; action?: string } = $props();

  let el: HTMLDivElement;
  let turnstile: Turnstile | null = null;
  let widgetId: string | undefined;
  let problem = $state('');

  const queue = new TokenQueue(() => {
    if (turnstile && widgetId !== undefined) turnstile.reset(widgetId);
  });

  /** A fresh token for one submission. */
  export function token(): Promise<string> {
    if (problem) return Promise.reject(new Error(problem));
    return queue.take();
  }

  onMount(() => {
    let gone = false;
    loadTurnstile()
      .then((t) => {
        if (gone) return;
        turnstile = t;
        widgetId = t.render(el, {
          sitekey: siteKey,
          action,
          theme: 'auto',
          size: 'flexible',
          callback: (tok) => queue.give(tok),
          'expired-callback': () => queue.expire(),
          'timeout-callback': () => queue.expire(),
          'error-callback': () => {
            queue.fail(new Error('The security check failed. Try again, or reload the page.'));
          },
        });
      })
      .catch((e: Error) => {
        problem = e.message;
        queue.fail(e);
      });
    return () => {
      gone = true;
      if (turnstile && widgetId !== undefined) turnstile.remove(widgetId);
    };
  });
</script>

<div class="captcha" bind:this={el}></div>
{#if problem}<p class="error" role="alert">{problem}</p>{/if}

<style>
  .captcha:empty {
    display: none;
  }
</style>
