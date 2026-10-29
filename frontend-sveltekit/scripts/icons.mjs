// Placeholder app icons: the favicon's ring on ink, written as PNGs with nothing but Node.
// `npm run icons` writes static/icons/. To use real icons, replace those files (same names and
// sizes) and static/favicon.svg, and delete this script if you like. See README → Icons.

import { mkdirSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const BG = [31, 35, 40]; // as static/favicon.svg
const FG = [246, 245, 242];

/**
 * One icon. `inset` is the share of the size left around the drawing (maskable icons keep it
 * inside the middle 80%); `radius` rounds the background's corners (0 for full bleed).
 */
function icon(size, { radius = 0, inset = 0.2 } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const s = 4; // samples per side, for smooth edges
  const c = size / 2;
  const outer = (size / 2) * (1 - inset * 2) * 0.82;
  const inner = outer * 0.58;
  const r = radius * size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < s; sy++) {
        for (let sx = 0; sx < s; sx++) {
          const fx = x + (sx + 0.5) / s;
          const fy = y + (sy + 0.5) / s;
          // Inside the rounded square?
          const dx = Math.max(r - fx, 0, fx - (size - r));
          const dy = Math.max(r - fy, 0, fy - (size - r));
          if (r === 0 || dx * dx + dy * dy <= r * r) bg++;
          const d = Math.hypot(fx - c, fy - c);
          if (d <= outer && d >= inner) fg++;
        }
      }
      const a = bg / (s * s);
      const f = fg / (s * s);
      const i = (y * size + x) * 4;
      for (let k = 0; k < 3; k++) px[i + k] = Math.round(BG[k] * (1 - f) + FG[k] * f);
      px[i + 3] = Math.round(a * 255);
    }
  }
  return png(size, px);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

function png(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('static/icons', { recursive: true });
const files = {
  'icon-192.png': icon(192, { radius: 0.22, inset: 0.1 }),
  'icon-512.png': icon(512, { radius: 0.22, inset: 0.1 }),
  'maskable-512.png': icon(512, { inset: 0.2 }),
  'apple-touch-icon.png': icon(180, { inset: 0.12 }),
};
for (const [name, data] of Object.entries(files)) writeFileSync(`static/icons/${name}`, data);
console.log(`Wrote ${Object.keys(files).join(', ')} to static/icons/`);
