<!--
  Push notifications on this device (PRD R4.2): on, off, and "send me a test". Shown only when
  /features gives a VAPID key. The in-app list (the bell) works either way.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '#lib/api/index.ts';
  import { pushOff, pushOn, pushState, type PushState } from '#lib/push.ts';
  import { auth } from '#lib/session.svelte.ts';
  import { Task } from '#lib/task.svelte.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
  import FormError from '../FormError.svelte';
  import SubmitButton from '../SubmitButton.svelte';

  let current = $state<PushState | null>(null);
  let status = $state('');
  const toggle = new Task();
  const test = new Task();

  onMount(async () => {
    current = await pushState();
  });

  function turnOn() {
    status = '';
    toggle.run(async () => {
      current = await pushOn(auth.features!.push!.vapidPublicKey);
      if (current === 'on') status = t('Notifications are on for this device.');
    });
  }

  function turnOff() {
    status = '';
    toggle.run(async () => {
      current = await pushOff();
      status = t('Notifications are off for this device.');
    });
  }

  function sendTest() {
    status = '';
    test.run(async () => {
      await api.pushTest();
      status = t('Test sent. It should arrive in a moment.');
    });
  }
</script>

<div class="stack">
  {#if current === null}
    <p class="muted">{t('Checking this device…')}</p>
  {:else if current === 'unsupported'}
    <p class="muted">{t('This browser can’t show notifications. You’ll still see them in the bell.')}</p>
  {:else if current === 'install'}
    <p class="muted">
      {t(
        'On iPhone and iPad, add this app to your Home Screen (Share, then Add to Home Screen) and open it from there to turn notifications on.',
      )}
    </p>
  {:else if current === 'blocked'}
    <p class="muted">
      {t(
        'Notifications are blocked for this site. Allow them in your browser’s site settings, then come back here.',
      )}
    </p>
  {:else if current === 'off'}
    <p class="muted">
      {t('Get a notification on this device when something happens, even when the app is closed.')}
    </p>
    <div>
      <SubmitButton task={toggle} type="button" wide={false} busyLabel={t('Turning on…')} onclick={turnOn}>
        {t('Turn on notifications')}
      </SubmitButton>
    </div>
  {:else}
    <p>{t('Notifications are on for this device.')}</p>
    <div class="row">
      <SubmitButton
        task={test}
        type="button"
        wide={false}
        variant="plain"
        busyLabel={t('Sending…')}
        onclick={sendTest}
      >
        {t('Send me a test')}
      </SubmitButton>
      <SubmitButton
        task={toggle}
        type="button"
        wide={false}
        variant="plain"
        busyLabel={t('Turning off…')}
        onclick={turnOff}
      >
        {t('Turn off')}
      </SubmitButton>
    </div>
  {/if}
  <FormError message={toggle.error || test.error} />
  <p class="success" role="status">{status}</p>
</div>
