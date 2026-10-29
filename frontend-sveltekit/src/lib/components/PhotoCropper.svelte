<!--
  Crop a chosen photo to a square: drag (or arrow keys) to move it, the slider (or + and -) to
  zoom. Gives back a 512 px JPEG through `onDone`; the parent uploads it.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { centreCrop, clampCrop, cropRect, MAX_ZOOM, panCrop, renderCrop, type Crop } from '#lib/images.ts';
  import { messageOf } from '#lib/api/errors.ts';
  import Spinner from './Spinner.svelte';

  let {
    image,
    onDone,
    onCancel,
  }: { image: ImageBitmap; onDone: (photo: Blob) => Promise<void> | void; onCancel: () => void } = $props();

  let dialog: HTMLDialogElement;
  let frame = $state(280);
  let crop = $state<Crop>(centreCrop(1, 1));
  let busy = $state(false);
  let error = $state('');
  let previewUrl = $state('');

  const rect = $derived(cropRect(image.width, image.height, crop));
  const scale = $derived(frame / rect.side);

  onMount(() => {
    crop = centreCrop(image.width, image.height);
    // Show the bitmap through a canvas-made URL, since <img> can't take an ImageBitmap.
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d')?.drawImage(image, 0, 0);
    canvas.toBlob((b) => b && (previewUrl = URL.createObjectURL(b)), 'image/jpeg', 0.92);
    dialog.showModal();
    return () => previewUrl && URL.revokeObjectURL(previewUrl);
  });

  let drag: { id: number; x: number; y: number } | null = null;

  function down(e: PointerEvent) {
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function move(e: PointerEvent) {
    if (!drag || drag.id !== e.pointerId) return;
    crop = panCrop(image.width, image.height, crop, e.clientX - drag.x, e.clientY - drag.y, frame);
    drag = { ...drag, x: e.clientX, y: e.clientY };
  }

  function up() {
    drag = null;
  }

  function zoomTo(zoom: number) {
    crop = clampCrop(image.width, image.height, { ...crop, zoom });
  }

  function wheel(e: WheelEvent) {
    e.preventDefault();
    zoomTo(crop.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
  }

  function key(e: KeyboardEvent) {
    const step = e.shiftKey ? 40 : 10;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const m = moves[e.key];
    if (m) crop = panCrop(image.width, image.height, crop, m[0], m[1], frame);
    else if (e.key === '+' || e.key === '=') zoomTo(crop.zoom + 0.1);
    else if (e.key === '-') zoomTo(crop.zoom - 0.1);
    else return;
    e.preventDefault();
  }

  async function use() {
    busy = true;
    error = '';
    try {
      const photo = await renderCrop(image, crop);
      await onDone(photo);
      dialog.close();
    } catch (e) {
      error = messageOf(e);
    } finally {
      busy = false;
    }
  }
</script>

<dialog
  bind:this={dialog}
  aria-labelledby="crop-title"
  onclose={() => !busy && onCancel()}
  oncancel={(e) => busy && e.preventDefault()}
>
  <h2 id="crop-title">Crop your photo</h2>
  <p class="muted small" id="crop-help">
    Drag to move it, or use the arrow keys. Zoom with the slider, or + and −.
  </p>

  <!-- A two-way position control has no ARIA widget role of its own: `application` passes the
       arrow keys through, and the description says how to use it. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div
    class="frame"
    bind:clientWidth={frame}
    role="application"
    tabindex="0"
    aria-roledescription="photo position"
    aria-label="Photo position"
    aria-describedby="crop-help"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    onwheel={wheel}
    onkeydown={key}
  >
    {#if previewUrl}
      <img
        src={previewUrl}
        alt=""
        draggable="false"
        style:width="{image.width * scale}px"
        style:height="{image.height * scale}px"
        style:transform="translate({-rect.sx * scale}px, {-rect.sy * scale}px)"
      />
    {/if}
  </div>

  <div class="field">
    <label for="crop-zoom">Zoom</label>
    <input
      id="crop-zoom"
      type="range"
      min="1"
      max={MAX_ZOOM}
      step="0.01"
      value={crop.zoom}
      oninput={(e) => zoomTo(Number(e.currentTarget.value))}
    />
  </div>

  <div role="alert">
    {#if error}<p class="error">{error}</p>{/if}
  </div>

  <div class="actions">
    <button type="button" class="btn" onclick={() => dialog.close()} disabled={busy}>Cancel</button>
    <button type="button" class="btn primary" onclick={use} aria-busy={busy} disabled={busy}>
      {#if busy}<Spinner />Saving…{:else}Use photo{/if}
    </button>
  </div>
</dialog>

<style>
  dialog {
    width: min(26rem, calc(100vw - 2rem));
    padding: var(--space-5);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-bg);
    color: var(--color-text);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  dialog:not([open]) {
    display: none;
  }

  dialog::backdrop {
    background: oklch(0% 0 0 / 0.5);
  }

  .frame {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: var(--radius-sm);
    background: var(--color-sunken);
    cursor: grab;
    touch-action: none;
    user-select: none;
  }

  .frame:active {
    cursor: grabbing;
  }

  /* The circle shows how the photo will look as an avatar. */
  .frame::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    box-shadow: 0 0 0 999px oklch(0% 0 0 / 0.35);
    pointer-events: none;
  }

  img {
    position: absolute;
    top: 0;
    left: 0;
    max-width: none;
    transform-origin: 0 0;
    pointer-events: none;
  }

  input[type='range'] {
    width: 100%;
    accent-color: var(--color-accent);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
  }
</style>
