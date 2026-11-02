// Show-me lab: which names make SAM find each piece of a step in a photo of loose pieces.
// Usage: node scripts/lab/pieces.mjs [photo] [baseUrl]   (app running)  → smoke-output/pieces/<prompt>.jpg + report
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const photo = process.argv[2] ?? "scripts/lab/photos/roller-pile.jpg";
const base = process.argv[3] ?? "http://localhost:3100";
const OUT = "smoke-output/pieces";
await mkdir(OUT, { recursive: true });

// Candidate names per piece; the lab keeps the one that finds the right count.
const PROMPTS = process.env.PROMPTS ? process.env.PROMPTS.split("|") : [
  "dark gray plate", "gray plate", "black corner plate", "black L-shaped plate", "black plate",
  "yellow brick with hole", "yellow technic brick", "black bracket", "black 2x2 plate",
  "black brick with pin", "black brick", "black pin", "black plate with holes",
  "yellow 1x1 brick", "yellow cube", "yellow round bush", "yellow beam", "yellow plate", "yellow 2x4 plate",
  "yellow curved slope", "yellow quarter circle tile", "yellow 2x2 plate",
  "clear brick", "transparent brick", "yellow windscreen", "yellow grille tile", "yellow tile",
  "black axle", "black drum", "black gear", "black tire", "yellow wheel rim",
];

const { data: jpeg, info } = await sharp(photo).rotate().resize({ width: 768 }).jpeg({ quality: 85 }).toBuffer({ resolveWithObject: true });
const image = `data:image/jpeg;base64,${jpeg.toString("base64")}`;

async function find(prompt) {
  for (let tries = 0; ; tries++) {
    const res = await fetch(`${base}/api/segment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image, prompt, width: info.width, height: info.height }) });
    if (res.status === 429 && tries < 6) { await new Promise((r) => setTimeout(r, 15000)); continue; }
    return res.json();
  }
}

const report = [];
for (let i = 0; i < PROMPTS.length; i += 4) {
  await Promise.all(PROMPTS.slice(i, i + 4).map(async (prompt) => {
    const data = await find(prompt);
    const matches = data.matches ?? [];
    report.push({ prompt, via: data.via, n: matches.length, conf: matches.map((m) => (m.confidence ?? 0).toFixed(2)).join(" ") });
    const boxes = matches.map((m, k) => `<rect x="${m.bounds.left}" y="${m.bounds.top}" width="${m.bounds.right - m.bounds.left}" height="${m.bounds.bottom - m.bounds.top}" fill="none" stroke="${k === 0 ? "#ff00ff" : "#00e5ff"}" stroke-width="4"/><text x="${m.bounds.left}" y="${m.bounds.top - 4}" font-size="22" font-weight="700" fill="#ff00ff">${k + 1}</text>`).join("");
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}">${boxes}<text x="10" y="34" font-size="30" font-weight="700" fill="#ff00ff">${prompt} (${matches.length}, ${data.via})</text></svg>`);
    await sharp(jpeg).composite([{ input: svg }]).jpeg({ quality: 70 }).toFile(`${OUT}/${prompt.replace(/\W+/g, "-")}.jpg`);
  }));
}
report.sort((a, b) => PROMPTS.indexOf(a.prompt) - PROMPTS.indexOf(b.prompt));
for (const r of report) console.log(`${r.prompt.padEnd(28)} ${String(r.n).padStart(2)}  ${r.via.padEnd(9)} ${r.conf}`);
await writeFile(`${OUT}/report.json`, JSON.stringify(report, null, 2));
