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

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  let line = "";
  for (const word of text.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else line = test;
  }
  ctx.fillText(line, x, y);
  return y + lineHeight;
}

export async function drawCard(data: CardData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d")!;

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
  ctx.fillText("STEPSIGHT · BUILD CARD", 140, 215);

  const frame = data.photo ? await load(data.photo) : null;
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

  const timber = await load("/mascot/timber.webp");
  if (timber) ctx.drawImage(timber, 760, 600, 220, 220);

  ctx.fillStyle = INK;
  ctx.font = "600 64px Georgia, serif";
  const y = wrap(ctx, data.title, 140, 860, 800, 72);

  ctx.font = "34px monospace";
  ctx.fillText(`${data.minutes} min · ${data.stars}/${data.steps} first try · ${data.mistakes} fixed`, 140, y + 20);

  ctx.fillStyle = "#E4FF3A";
  ctx.beginPath();
  ctx.roundRect(140, 1070, 420, 80, 40);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.font = "36px monospace";
  ctx.fillText("Built by me. Timber watched.", 160, 1122);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("card"))), "image/png"));
}

export async function shareCard(data: CardData) {
  const file = new File([await drawCard(data)], "stepsight-card.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: "I built it with StepSight" });
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
}
