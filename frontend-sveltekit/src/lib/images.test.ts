import { describe, expect, it } from 'vitest';
import { centreCrop, clampCrop, cropRect, MAX_ZOOM, outputSide, panCrop, sourceProblem } from './images';

describe('cropping', () => {
  it('starts with the largest centred square', () => {
    expect(cropRect(4000, 3000, centreCrop(4000, 3000))).toEqual({ sx: 500, sy: 0, side: 3000 });
    expect(cropRect(600, 900, centreCrop(600, 900))).toEqual({ sx: 0, sy: 150, side: 600 });
  });

  it('zooms into a smaller square around the same centre', () => {
    expect(cropRect(4000, 3000, { cx: 2000, cy: 1500, zoom: 2 })).toEqual({ sx: 1250, sy: 750, side: 1500 });
  });

  it('keeps the square inside the image', () => {
    expect(cropRect(4000, 3000, { cx: 0, cy: 0, zoom: 1 })).toEqual({ sx: 0, sy: 0, side: 3000 });
    expect(cropRect(4000, 3000, { cx: 99999, cy: 99999, zoom: 2 })).toEqual({
      sx: 2500,
      sy: 1500,
      side: 1500,
    });
  });

  it('clamps zoom between 1 and the maximum', () => {
    expect(clampCrop(1000, 1000, { cx: 500, cy: 500, zoom: 0.2 }).zoom).toBe(1);
    expect(clampCrop(1000, 1000, { cx: 500, cy: 500, zoom: 99 }).zoom).toBe(MAX_ZOOM);
  });

  it('pans by screen distance, scaled to image pixels', () => {
    // A 2000 px wide square shown 200 px wide: 10 image px per screen px.
    const start = { cx: 2000, cy: 1000, zoom: 1 };
    const moved = panCrop(4000, 2000, start, 50, 0, 200);
    expect(moved.cx).toBe(1500); // dragging right shows more of the left
    expect(moved.cy).toBe(1000); // the square already fills the height
  });

  it('never upscales a small crop', () => {
    expect(outputSide({ sx: 0, sy: 0, side: 3000 })).toBe(512);
    expect(outputSide({ sx: 0, sy: 0, side: 300 })).toBe(300);
  });
});

describe('choosing a file', () => {
  it('takes images and refuses other files', () => {
    expect(sourceProblem(new File(['x'], 'me.jpg', { type: 'image/jpeg' }))).toBeNull();
    expect(sourceProblem(new File(['x'], 'IMG_1.HEIC', { type: '' }))).toBeNull();
    expect(sourceProblem(new File(['x'], 'notes.pdf', { type: 'application/pdf' }))).toMatch(
      /Choose an image/,
    );
  });
});
