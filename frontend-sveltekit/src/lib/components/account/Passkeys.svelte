<!-- This account's passkeys: list, add one on this device, remove (PRD R1.6). -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type Passkey } from '#lib/api/index.ts';
  import { formatWhen } from '#lib/format.ts';
  import { addPasskey, passkeysSupported } from '#lib/passkeys.ts';
  import { Task } from '#lib/task.svelte.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
  import ConfirmEmailFirst from '../ConfirmEmailFirst.svelte';
  import FormError from '../FormError.svelte';
  import SubmitButton from '../SubmitButton.svelte';
  import Button from '../ui/Button.svelte';
  import List from '../ui/List.svelte';

  let passkeys = $state<Passkey[] | null>(null);
  let supported = $state(true);
  let confirming = $state<string | null>(null);
  let status = $state('');
  const load = new Task();
  const add = new Task();
  const remove = new Task();

  onMount(() => {
    supported = passkeysSupported();
    load.run(async () => {
      passkeys = await api.passkeys();
    });
  });

  function addOne() {
    status = '';
    add.run(async () => {
      const passkey = await addPasskey();
      passkeys = [...(passkeys ?? []), passkey];
      status = t('Passkey added.');
    });
  }

  function removeOne(id: string) {
    status = '';
    remove.run(async () => {
      await api.removePasskey(id);
      passkeys = (passkeys ?? []).filter((p) => p.id !== id);
      confirming = null;
      status = t('Passkey removed.');
    });
  }
</script>

<div class="stack">
  {#if passkeys === null}
    {#if load.error}<FormError message={load.error} />{:else}<p class="muted">{t('Loading…')}</p>{/if}
  {:else if passkeys.length === 0}
    <p class="muted">{t('No passkeys yet.')}</p>
  {:else}
    <List>
      {#each passkeys as p (p.id)}
        <li>
          <div>
            <p class="title">{p.device}</p>
            <p class="muted small">
              {t('Added {added}', { added: formatWhen(p.createdAt) })} · {p.lastUsedAt
                ? t('Last used {lastUsed}', { lastUsed: formatWhen(p.lastUsedAt) })
                : t('Not used yet')}
            </p>
          </div>
          {#if confirming === p.id}
            <div class="row">
              <SubmitButton
                task={remove}
                type="button"
                variant="danger"
                wide={false}
                busyLabel={t('Removing…')}
                onclick={() => removeOne(p.id)}>{t('Remove')}</SubmitButton
              >
              <Button type="button" size="small" onclick={() => (confirming = null)}>{t('Keep')}</Button>
            </div>
          {:else}
            <Button
              type="button"
              size="small"
              onclick={() => (confirming = p.id)}
              aria-label={t('Remove passkey {device}, added {added}', {
                device: p.device,
                added: formatWhen(p.createdAt),
              })}>{t('Remove')}</Button
            >
          {/if}
        </li>
      {/each}
    </List>
  {/if}

  {#if add.code === 'email_unverified'}
    <ConfirmEmailFirst action={t('add a passkey')} />
  {:else}
    <FormError message={add.error || remove.error} />
  {/if}
  {#if supported}
    <div class="row">
      <SubmitButton
        task={add}
        type="button"
        wide={false}
        variant="plain"
        busyLabel={t('Waiting for your device…')}
        onclick={addOne}
      >
        {t('Add a passkey on this device')}
      </SubmitButton>
      <span class="success" role="status">{status}</span>
    </div>
  {:else}
    <p class="muted small">{t('This browser can’t make passkeys.')}</p>
  {/if}
</div>
