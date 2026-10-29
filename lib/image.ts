import type { Match } from "./sam";

export type Shot = { image: string; width: number; height: number };

export function toShot(source: CanvasImageSource, width: number, height: number, maxWidth = 768): Shot {
  const scale = Math.min(1, maxWidth / width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return { image: canvas.toDataURL("image/jpeg", 0.85), width: canvas.width, height: canvas.height };
}

export async function fileToShot(file: File): Promise<Shot> {
  const bitmap = await createImageBitmap(file);
  return toShot(bitmap, bitmap.width, bitmap.height);
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
      resolve(canvas.toDataURL("image/jpeg", 0.6));
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
