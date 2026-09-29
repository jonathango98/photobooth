// Encodes the GIF-mode collage off the main thread so the result screen's
// preview animation stays smooth while the GIF is built.
//
// Input:  { width, height, frames: ArrayBuffer[] (RGBA), order: number[], delayMs }
//         `frames` are the unique composited frames; `order` is the playback
//         sequence of indexes into them (a boomerang repeats frames).
// Output: { ok: true, bytes: Uint8Array } or { ok: false, error }
import { GIFEncoder, quantize, applyPalette } from './vendor/gifenc.esm.js';

// Every 4th pixel of every frame — plenty to build a palette, 4x less work.
function samplePixels(frames) {
  const pixelsPerFrame = frames[0].length / 4;
  const perFrame = Math.ceil(pixelsPerFrame / 4);
  const out = new Uint8Array(perFrame * frames.length * 4);
  let o = 0;
  for (const rgba of frames) {
    for (let p = 0; p < pixelsPerFrame; p += 4) {
      const i = p * 4;
      out[o++] = rgba[i];
      out[o++] = rgba[i + 1];
      out[o++] = rgba[i + 2];
      out[o++] = rgba[i + 3];
    }
  }
  return out.subarray(0, o);
}

self.onmessage = (e) => {
  const { width, height, frames, order, delayMs } = e.data;
  try {
    const pixels = frames.map((buf) => new Uint8Array(buf));
    // One palette shared by every frame — per-frame palettes shimmer on playback.
    const palette = quantize(samplePixels(pixels), 256);
    const indexed = pixels.map((rgba) => applyPalette(rgba, palette));

    const gif = GIFEncoder();
    order.forEach((f, i) => {
      // The palette on the first frame becomes the global color table
      gif.writeFrame(indexed[f], width, height, {
        ...(i === 0 && { palette }),
        delay: delayMs,
      });
    });
    gif.finish();

    const bytes = gif.bytes();
    self.postMessage({ ok: true, bytes }, [bytes.buffer]);
  } catch (err) {
    self.postMessage({ ok: false, error: String(err?.message || err) });
  }
};
