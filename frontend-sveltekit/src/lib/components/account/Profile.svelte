<!-- Name and photo (PRD R2.1, R2.3). -->
<script lang="ts">
  import { api } from '#lib/api/index.ts';
  import { auth } from '#lib/session.svelte.ts';
  import { decodeImage, sourceProblem } from '#lib/images.ts';
  import { Task } from '#lib/task.svelte.ts';
  import Avatar from '../Avatar.svelte';
  import FormError from '../FormError.svelte';
  import PhotoCropper from '../PhotoCropper.svelte';
  import SubmitButton from '../SubmitButton.svelte';

  const user = $derived(auth.user!);

  let name = $state(auth.user?.name ?? '');
  let saved = $state(false);
  const nameTask = new Task();
  const photoTask = new Task();
  let picked = $state<ImageBitmap | null>(null);
  let fileInput: HTMLInputElement;

  async function saveName(e: SubmitEvent) {
    e.preventDefault();
    saved = false;
    const clean = name.replace(/\s+/g, ' ').trim();
    if (!clean) {
      nameTask.error = 'Enter a name.';
      return;
    }
    if (clean.length > 60) {
      nameTask.error = 'Use 60 characters or fewer.';
      return;
    }
    if (
      await nameTask.run(async () => {
        auth.user = await api.setName(clean);
        name = auth.user.name ?? '';
      })
    )
      saved = true;
  }

  async function choose(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    photoTask.clear();
    const problem = sourceProblem(file);
    if (problem) {
      photoTask.error = problem;
      return;
    }
    await photoTask.run(async () => {
      picked = await decodeImage(file);
    });
  }

  async function upload(photo: Blob) {
    // Errors show in the cropper, which stays open to try again.
    auth.user = await api.setPhoto(photo);
    picked?.close();
    picked = null;
  }

  function removePhoto() {
    photoTask.run(async () => {
      auth.user = await api.removePhoto();
    });
  }
</script>

<div class="photo">
  <Avatar {user} size={72} />
  <div class="stack">
    <div class="row">
      <input
        bind:this={fileInput}
        class="visually-hidden"
        id="photo-file"
        type="file"
        accept="image/*"
        tabindex="-1"
        onchange={choose}
      />
      <button type="button" class="btn small" onclick={() => fileInput.click()} disabled={photoTask.busy}>
        {user.photoUrl ? 'Change photo' : 'Add a photo'}
      </button>
      {#if user.photoUrl}
        <button type="button" class="btn small" onclick={removePhoto} disabled={photoTask.busy}>Remove</button
        >
      {/if}
    </div>
    <FormError message={photoTask.error} />
  </div>
</div>

{#if picked}
  <PhotoCropper
    image={picked}
    onDone={upload}
    onCancel={() => {
      picked?.close();
      picked = null;
    }}
  />
{/if}

<form class="stack" onsubmit={saveName} novalidate>
  <div class="field">
    <label for="name">Name</label>
    <input
      id="name"
      class="input"
      bind:value={name}
      autocomplete="name"
      maxlength="60"
      aria-invalid={!!nameTask.error}
      aria-describedby="name-error"
      oninput={() => (saved = false)}
    />
  </div>
  <FormError id="name-error" message={nameTask.error} />
  <div class="row">
    <SubmitButton task={nameTask} wide={false} busyLabel="Saving…">Save name</SubmitButton>
    <span class="success" role="status">{saved ? 'Saved.' : ''}</span>
  </div>
</form>

<style>
  .photo {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }
</style>
