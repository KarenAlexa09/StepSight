// Cuts each piece out of the parts box of every booklet panel (set 21015), left to right, with SAM.
// Usage: node scripts/make-roller-parts.mjs   (app running on :3100) → smoke-output/roller-parts/<step>-<k>.jpg + sheet.jpg
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const DIR = "scripts/manuals/21015";
const OUT = "smoke-output/roller-parts";
await mkdir(OUT, { recursive: true });
// Share of each panel's height the parts box takes (landscape panels 7–9 keep it in the top-left).
const BOX = { 1: [1, 0.33], 2: [1, 0.33], 3: [1, 0.3], 4: [1, 0.27], 5: [1, 0.3], 6: [1, 0.3], 7: [0.48, 0.33], 8: [0.45, 0.33], 9: [0.47, 0.33] };

const tiles = [];
for (let n = 1; n <= 9; n++) {
  const img = sharp(`${DIR}/${n}.jpg`);
  const { width, height } = await img.metadata();
  const box = { left: 0, top: 0, width: Math.round(width * BOX[n][0]), height: Math.round(height * BOX[n][1]) };
  const buf = await sharp(`${DIR}/${n}.jpg`).extract(box).jpeg({ quality: 92 }).toBuffer();
  const res = await fetch("http://localhost:3100/api/segment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: `data:image/jpeg;base64,${buf.toString("base64")}`, prompt: "lego piece" }) });
  const found = ((await res.json()).matches ?? []).sort((a, b) => a.bounds.left - b.bounds.left);
  console.log(`step ${n}: ${found.length} pieces`);
  for (const [k, m] of found.entries()) {
    const pad = 6;
    const left = Math.max(0, m.bounds.left - pad), top = Math.max(0, m.bounds.top - pad);
    const w = Math.min(box.width - left, m.bounds.right - m.bounds.left + pad * 2), h = Math.min(box.height - top, m.bounds.bottom - m.bounds.top + pad * 2);
    const out = `${OUT}/${n}-${k + 1}.jpg`;
    await sharp(buf).extract({ left, top, width: w, height: h }).resize(96, 96, { fit: "contain", background: "#ffffff" }).flatten({ background: "#ffffff" }).jpeg({ quality: 88 }).toFile(out);
    tiles.push({ input: await sharp(out).toBuffer(), left: k * 100, top: (n - 1) * 100 });
  }
}
await sharp({ create: { width: 800, height: 900, channels: 3, background: "#ddd" } }).composite(tiles).jpeg({ quality: 85 }).toFile(`${OUT}/sheet.jpg`);
