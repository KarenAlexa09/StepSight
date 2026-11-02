import type { Match } from "./sam";

export type Shot = { image: string; width: number; height: number };

// ratio: when the frame is taller than that width/height ratio, keep only its centered middle, like object-fit: cover shows it.
// Sides are never cut: a square demo photo in a narrow view would lose its bricks.
export function toShot(source: CanvasImageSource, width: number, height: number, maxWidth = 768, quality = 0.85, ratio?: number): Shot {
  let [sy, sh] = [0, height];
  if (ratio && width / height < ratio) [sh, sy] = [Math.round(width / ratio), Math.round((height - width / ratio) / 2)];
  const [sx, sw] = [0, width];
  const scale = Math.min(1, maxWidth / sw);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  canvas.getContext("2d")!.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return { image: canvas.toDataURL("image/jpeg", quality), width: canvas.width, height: canvas.height };
}

export async function fileToShot(file: File, maxWidth?: number, quality?: number): Promise<Shot> {
  const bitmap = await createImageBitmap(file);
  return toShot(bitmap, bitmap.width, bitmap.height, maxWidth, quality);
}

export function maskTransform(m: Match) {
  const { left, top, right, bottom } = m.bounds;
  return `translate(${left} ${top}) scale(${(right - left) / m.size[0]} ${(bottom - top) / m.size[1]})`;
}

export function thumb(dataUrl: string, width = 240): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = Math.round((img.height / img.width) * width);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export function cropBox(dataUrl: string, bounds: Match["bounds"], size = 180): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = bounds.right - bounds.left;
      const h = bounds.bottom - bounds.top;
      const side = Math.max(w, h) * 1.5;
      const x = Math.max(0, Math.min(img.width - side, bounds.left + w / 2 - side / 2));
      const y = Math.max(0, Math.min(img.height - side, bounds.top + h / 2 - side / 2));
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      canvas.getContext("2d")!.drawImage(img, x, y, side, side, 0, 0, size, size);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => reject(new Error("crop failed"));
    img.src = dataUrl;
  });
}

// Set-of-Mark: a white numbered label on the center of every piece SAM found, for Muse Spark to pick from.
export function drawMarks(shot: Shot, matches: Match[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = shot.width;
      canvas.height = shot.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, shot.width, shot.height);
      const r = Math.max(10, Math.round(shot.width / 64));
      ctx.font = `700 ${Math.round(r * 1.15)}px Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 2;
      matches.forEach((m, i) => {
        const x = (m.bounds.left + m.bounds.right) / 2;
        const y = (m.bounds.top + m.bounds.bottom) / 2;
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#000";
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#000";
        ctx.fillText(String(i + 1), x, y + 1);
      });
      resolve(canvas.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = reject;
    img.src = shot.image;
  });
}
