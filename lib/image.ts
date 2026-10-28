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
