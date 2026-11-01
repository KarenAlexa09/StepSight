// Keeps a highlight on its part between SAM calls: a small grayscale patch is matched frame to frame on the phone.
export const TRACK_WIDTH = 160;
const MAX_PATCH = 40;

export type Gray = { data: Uint8Array; width: number; height: number };
export type Patch = { data: Uint8Array; w: number; h: number; x: number; y: number };

export function toGray(rgba: Uint8ClampedArray, width: number, height: number): Gray {
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = (rgba[i * 4] * 3 + rgba[i * 4 + 1] * 6 + rgba[i * 4 + 2]) / 10;
  return { data, width, height };
}

// The patch is the middle of the part's box, at most MAX_PATCH px a side, so big parts stay cheap to follow.
export function cut(frame: Gray, box: { left: number; top: number; right: number; bottom: number }): Patch | null {
  const w = Math.min(MAX_PATCH, Math.round(box.right - box.left));
  const h = Math.min(MAX_PATCH, Math.round(box.bottom - box.top));
  if (w < 6 || h < 6) return null;
  const x = Math.max(0, Math.min(frame.width - w, Math.round((box.left + box.right - w) / 2)));
  const y = Math.max(0, Math.min(frame.height - h, Math.round((box.top + box.bottom - h) / 2)));
  const data = new Uint8Array(w * h);
  for (let row = 0; row < h; row++) data.set(frame.data.subarray((y + row) * frame.width + x, (y + row) * frame.width + x + w), row * w);
  return { data, w, h, x, y };
}

// Best spot for the patch within `radius` px of where it was; error is the mean gray difference there (0–255).
export function follow(frame: Gray, patch: Patch, radius = 12): { x: number; y: number; error: number } {
  let best = { x: patch.x, y: patch.y, error: Infinity };
  for (let dy = -radius; dy <= radius; dy += 2) {
    for (let dx = -radius; dx <= radius; dx += 2) {
      const x = patch.x + dx;
      const y = patch.y + dy;
      if (x < 0 || y < 0 || x + patch.w > frame.width || y + patch.h > frame.height) continue;
      let sum = 0;
      for (let row = 0; row < patch.h; row += 2) {
        const f = (y + row) * frame.width + x;
        const p = row * patch.w;
        for (let col = 0; col < patch.w; col += 2) sum += Math.abs(frame.data[f + col] - patch.data[p + col]);
      }
      const error = sum / (Math.ceil(patch.h / 2) * Math.ceil(patch.w / 2));
      if (error < best.error) best = { x, y, error };
    }
  }
  return best;
}
