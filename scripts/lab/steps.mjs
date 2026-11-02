// Show-me lab for a whole step: asks for every piece of each step of a saved manual in a photo of loose pieces.
// Usage: node --experimental-strip-types scripts/lab/steps.mjs [photo] [steps like 1,4] [runs]   (app running on :3100)
// Output: smoke-output/steps/step-<n>-run<r>.jpg with one colored box per piece, and the found/expected count.
import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import { knownManual } from "../../lib/known.ts";

const photo = process.argv[2] ?? "scripts/lab/photos/roller-pile.jpg";
const only = process.argv[3] ? process.argv[3].split(",").map(Number) : null;
const runs = Number(process.argv[4] ?? 1);
const OUT = "smoke-output/steps";
await mkdir(OUT, { recursive: true });
const COLORS = ["#ff00ff", "#00e5ff", "#ff6a00", "#00ff6a", "#ff0040", "#8a5cff"];

const { data: jpeg, info } = await sharp(photo).rotate().resize({ width: 768 }).jpeg({ quality: 85 }).toBuffer({ resolveWithObject: true });
const image = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
const manual = knownManual("miniso road roller", "en");

async function find(parts) {
  for (let tries = 0; ; tries++) {
    const res = await fetch("http://localhost:3100/api/segment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image, parts, width: info.width, height: info.height }) });
    if (res.status === 429 && tries < 6) { await new Promise((r) => setTimeout(r, 15000)); continue; }
    return res.json();
  }
}

for (const step of manual.steps.filter((s) => !only || only.includes(s.number))) {
  for (let run = 1; run <= runs; run++) {
    const data = await find(step.parts);
    const matches = data.matches ?? [];
    const counts = step.parts.map((p, i) => `${matches.filter((m) => m.part === i).length}/${p.quantity} ${p.color} ${p.name}`);
    console.log(`step ${step.number} run ${run} (${(data.ms / 1000).toFixed(0)}s): ${counts.join(" · ")}`);
    const boxes = matches.map((m) => `<rect x="${m.bounds.left}" y="${m.bounds.top}" width="${m.bounds.right - m.bounds.left}" height="${m.bounds.bottom - m.bounds.top}" fill="none" stroke="${COLORS[m.part % COLORS.length]}" stroke-width="4"/><text x="${m.bounds.left}" y="${m.bounds.top - 4}" font-size="20" font-weight="700" fill="${COLORS[m.part % COLORS.length]}">${m.part + 1}</text>`).join("");
    const legend = step.parts.map((p, i) => `<text x="10" y="${30 + i * 26}" font-size="22" font-weight="700" fill="${COLORS[i % COLORS.length]}">${i + 1} ${p.quantity}x ${p.color} ${p.name}</text>`).join("");
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}">${boxes}${legend}</svg>`);
    await sharp(jpeg).composite([{ input: svg }]).jpeg({ quality: 70 }).toFile(`${OUT}/step-${step.number}-run${run}.jpg`);
  }
}
