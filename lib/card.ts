import { tr } from "./i18n";
import { formatMinutes } from "./progress";

export type CardData = { title: string; minutes: number; stars: number; steps: number; mistakes: number; photo?: string };

const INK = "#141414";
const PAPER = "#FBF7EF";

function load(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function lines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      out.push(line);
      line = word;
    } else line = test;
  }
  out.push(line);
  return out;
}

function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, start: number, min: number, font: (size: number) => string) {
  let size = start;
  ctx.font = font(size);
  while (size > min && ctx.measureText(text).width > maxWidth) ctx.font = font((size -= 2));
  return ctx.measureText(text).width;
}

function paint(ctx: CanvasRenderingContext2D, data: CardData, frame: HTMLImageElement | null, timber: HTMLImageElement | null) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.fillStyle = "#d6cebd";
  for (let x = 20; x < 1080; x += 36) for (let y = 20; y < 1350; y += 36) ctx.fillRect(x, y, 3, 3);

  ctx.fillStyle = "#C9C3F5";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  ctx.shadowColor = INK;
  ctx.shadowOffsetX = ctx.shadowOffsetY = 12;
  ctx.beginPath();
  ctx.roundRect(90, 150, 900, 1050, 40);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.stroke();

  ctx.fillStyle = INK;
  ctx.font = "32px monospace";
  ctx.fillText(tr("STEPSIGHT · BUILD CARD"), 140, 215);

  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.roundRect(140, 250, 800, 500, 28);
  ctx.fill();
  ctx.stroke();
  if (frame) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(146, 256, 788, 488, 24);
    ctx.clip();
    const scale = Math.max(788 / frame.width, 488 / frame.height);
    ctx.drawImage(frame, 146 + (788 - frame.width * scale) / 2, 256 + (488 - frame.height * scale) / 2, frame.width * scale, frame.height * scale);
    ctx.restore();
  }
  if (timber) ctx.drawImage(timber, 760, 600, 220, 220);

  ctx.fillStyle = INK;
  let size = 64;
  const titleFont = (n: number) => `600 ${n}px Georgia, serif`;
  ctx.font = titleFont(size);
  while (size > 40 && lines(ctx, data.title, 800).length > 2) ctx.font = titleFont((size -= 4));
  let y = 860;
  for (const line of lines(ctx, data.title, 800).slice(0, 2)) {
    ctx.fillText(line, 140, y);
    y += size + 8;
  }

  const stats = `${formatMinutes(data.minutes)} · ${tr("{stars}/{steps} first try · {n} fixed", { stars: data.stars, steps: data.steps, n: data.mistakes })}`;
  fit(ctx, stats, 800, 34, 22, (n) => `${n}px monospace`);
  ctx.fillText(stats, 140, y + 20);

  const stamp = tr("Built by me. Timber watched.");
  const width = fit(ctx, stamp, 760, 36, 24, (n) => `${n}px monospace`);
  ctx.fillStyle = "#E4FF3A";
  ctx.beginPath();
  ctx.roundRect(140, 1070, width + 40, 80, 40);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.fillText(stamp, 160, 1122);
}

const GIF_SCALE = 0.5;
const FRAME_MS = 450;
const HOLD_MS = 1800;

export async function drawCard(data: CardData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const [frame, timber] = await Promise.all([data.photo ? load(data.photo) : null, load("/mascot/hardhat.webp")]);
  paint(canvas.getContext("2d")!, data, frame, timber);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("card"))), "image/png"));
}

export async function drawGif(data: CardData, photos: string[]): Promise<Blob> {
  const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(1080 * GIF_SCALE);
  canvas.height = Math.round(1350 * GIF_SCALE);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const [images, timber] = await Promise.all([Promise.all(photos.map(load)), load("/mascot/hardhat.webp")]);
  const gif = GIFEncoder();
  images.forEach((frame, i) => {
    ctx.setTransform(GIF_SCALE, 0, 0, GIF_SCALE, 0, 0);
    paint(ctx, data, frame, timber);
    const { data: rgba } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const palette = quantize(rgba, 256);
    gif.writeFrame(applyPalette(rgba, palette), canvas.width, canvas.height, { palette, delay: i === images.length - 1 ? HOLD_MS : FRAME_MS });
  });
  gif.finish();
  return new Blob([gif.bytes() as BlobPart], { type: "image/gif" });
}

export async function shareCard(data: CardData, photos: string[] = []) {
  const gif = photos.length > 1 ? await drawGif(data, photos).catch(() => null) : null;
  const file = gif
    ? new File([gif], "stepsight-replay.gif", { type: "image/gif" })
    : new File([await drawCard(data)], "stepsight-card.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: tr("I built it with StepSight") });
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
}
