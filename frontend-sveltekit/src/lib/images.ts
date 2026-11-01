// Profile photos are cropped square and made small on the device before upload (PRD R2.3): the
// backend stores what it's sent, at most 2 MB, as PNG, JPEG or WebP.

import { t } from '#lib/i18n/index.svelte.ts';

export const PHOTO_SIZE = 512;
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
/** Larger originals are refused before decoding, so a phone doesn't run out of memory. */
export const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

/** Where the crop sits: its centre in image pixels, and the zoom (1 = the shorter side fits). */
export interface Crop {
  cx: number;
  cy: number;
  zoom: number;
}

export interface Rect {
  sx: number;
  sy: number;
  side: number;
}

export const MAX_ZOOM = 4;

export function centreCrop(width: number, height: number): Crop {
  return { cx: width / 2, cy: height / 2, zoom: 1 };
}

/** The square of the image a crop takes, kept inside the image. */
export function cropRect(width: number, height: number, crop: Crop): Rect {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, crop.zoom));
  const side = Math.min(width, height) / zoom;
  const half = side / 2;
  const cx = Math.min(width - half, Math.max(half, crop.cx));
  const cy = Math.min(height - half, Math.max(half, crop.cy));
  return { sx: cx - half, sy: cy - half, side };
}

/** The same crop with its centre and zoom pulled back inside the image. */
export function clampCrop(width: number, height: number, crop: Crop): Crop {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, crop.zoom));
  const { sx, sy, side } = cropRect(width, height, { ...crop, zoom });
  return { cx: sx + side / 2, cy: sy + side / 2, zoom };
}

/** Move the crop by a distance on screen, where the square is shown `frame` pixels wide. */
export function panCrop(
  width: number,
  height: number,
  crop: Crop,
  dx: number,
  dy: number,
  frame: number,
): Crop {
  const { side } = cropRect(width, height, crop);
  const scale = side / frame;
  return clampCrop(width, height, { ...crop, cx: crop.cx - dx * scale, cy: crop.cy - dy * scale });
}

/** The output's side: the target size, or smaller if the crop has fewer pixels. */
export function outputSide(rect: Rect, size = PHOTO_SIZE): number {
  return Math.max(1, Math.round(Math.min(size, rect.side)));
}

export function isImageFile(file: File): boolean {
  return /^image\//i.test(file.type) || /\.(jpe?g|png|webp|gif|heic|heif|avif)$/i.test(file.name);
}

/** Why a chosen file can't be used, or null. */
export function sourceProblem(file: File): string | null {
  if (!isImageFile(file)) return t('Choose an image: a JPEG, PNG or WebP photo.');
  if (file.size > MAX_SOURCE_BYTES) return t('That image is too large. Choose one under 40 MB.');
  return null;
}

/** Draw the crop into a square JPEG, lowering quality until it fits the upload limit. */
export async function renderCrop(
  image: CanvasImageSource & { width: number; height: number },
  crop: Crop,
  size = PHOTO_SIZE,
  maxBytes = MAX_UPLOAD_BYTES,
): Promise<Blob> {
  const rect = cropRect(image.width, image.height, crop);
  const out = outputSide(rect, size);
  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(t('This browser can’t prepare images.'));
  ctx.imageSmoothingQuality = 'high';
  // JPEG has no transparency: put the photo on white.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, out, out);
  ctx.drawImage(image, rect.sx, rect.sy, rect.side, rect.side, 0, 0, out, out);
  for (const quality of [0.9, 0.8, 0.65, 0.5]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
    if (!blob) break;
    if (blob.size <= maxBytes) return blob;
  }
  throw new Error(t('That photo couldn’t be made small enough. Try another.'));
}

/** Decode a chosen file, upright (browsers apply EXIF orientation). */
export async function decodeImage(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(t('That image couldn’t be opened. Try a JPEG or PNG.'));
  }
}
