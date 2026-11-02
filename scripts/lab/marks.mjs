// Set-of-Mark lab: SAM finds every piece, each gets a number, Muse Spark picks the numbers a step needs.
// Usage: node --env-file=.env --experimental-strip-types scripts/lab/marks.mjs [photo] [steps like 1,4]   (app running on :3100)
// Output: smoke-output/marks/step-<n>.jpg (picked pieces filled) and marks.jpg (every numbered piece).
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { knownManual } from "../../lib/known.ts";

const photo = process.argv[2] ?? "scripts/lab/photos/roller-pile.jpg";
const only = process.argv[3] ? process.argv[3].split(",").map(Number) : null;
const OUT = "smoke-output/marks";
await mkdir(OUT, { recursive: true });

const { data: jpeg, info } = await sharp(photo).rotate().resize({ width: 768 }).jpeg({ quality: 85 }).toBuffer({ resolveWithObject: true });
const image = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
const t0 = Date.now();
const all = (await (await fetch("http://localhost:3100/api/segment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image, prompt: "lego piece", width: info.width, height: info.height }) })).json()).matches;
console.log(`SAM: ${all.length} pieces in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const center = (m) => [Math.round((m.bounds.left + m.bounds.right) / 2), Math.round((m.bounds.top + m.bounds.bottom) / 2)];
const labels = all.map((m, i) => { const [x, y] = center(m); return `<circle cx="${x}" cy="${y}" r="11" fill="#fff" stroke="#000" stroke-width="2"/><text x="${x}" y="${y + 5}" font-size="13" font-weight="700" text-anchor="middle" font-family="Arial">${i + 1}</text>`; }).join("");
const marked = await sharp(jpeg).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}">${labels}</svg>`) }]).jpeg({ quality: 88 }).toBuffer();
await writeFile(`${OUT}/marks.jpg`, marked);
const markedUrl = `data:image/jpeg;base64,${marked.toString("base64")}`;

async function pick(parts) {
  const list = parts.map((p, i) => `${i + 1}. ${p.quantity}x ${p.color} ${p.name}${p.looks ? ` (${p.looks})` : ""}`).join("\n");
  const res = await fetch("https://api.meta.ai/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "muse-spark-1.3",
      reasoning: { effort: process.env.EFFORT ?? "minimal" },
      input: [{ role: "user", type: "message", content: [
        { type: "input_text", text:
          `Two photos of the same loose toy building pieces: the first is plain, the second has a white numbered label on every piece. Pick the pieces for this building step:\n${list}\n` +
          "For each numbered part, give the label numbers of matching pieces, up to its quantity. Look at the plain photo to judge color, shape and size; use the labels only to name the piece. Never pick the same label twice, and leave a part out rather than guess." },
        { type: "input_image", image_url: image },
        { type: "input_image", image_url: markedUrl },
      ] }],
      text: { format: { type: "json_schema", name: "picks", strict: true, schema: { type: "object", additionalProperties: false, required: ["picks"], properties: { picks: { type: "array", items: { type: "object", additionalProperties: false, required: ["part", "labels"], properties: { part: { type: "integer" }, labels: { type: "array", items: { type: "integer" } } } } } } } } },
    }),
  });
  const data = await res.json();
  const text = (data.output ?? []).flatMap((o) => o.content ?? []).filter((c) => c.type === "output_text").map((c) => c.text).join("");
  return JSON.parse(text).picks;
}

const manual = knownManual("miniso road roller", "en");
const COLORS = ["#ff00ff", "#00e5ff", "#ff6a00", "#00ff6a", "#ff0040", "#8a5cff"];
for (const step of manual.steps.filter((s) => !only || only.includes(s.number))) {
  const t = Date.now();
  const picks = await pick(step.parts);
  const chosen = picks.flatMap(({ part, labels }) => labels.slice(0, step.parts[part - 1]?.quantity ?? 0).map((l) => ({ part: part - 1, m: all[l - 1], l }))).filter((c) => c.m);
  console.log(`step ${step.number} (${((Date.now() - t) / 1000).toFixed(0)}s): ` + step.parts.map((p, i) => `${chosen.filter((c) => c.part === i).map((c) => c.l).join("+") || "-"} ${p.color} ${p.name}`).join(" · "));
  const masks = chosen.map(({ part, m }) => `<path d="${m.path}" transform="translate(${m.bounds.left} ${m.bounds.top}) scale(${(m.bounds.right - m.bounds.left) / m.size[0]} ${(m.bounds.bottom - m.bounds.top) / m.size[1]})" fill="${COLORS[part % 6]}" fill-opacity="0.6" stroke="${COLORS[part % 6]}" stroke-width="3"/>`).join("");
  const legend = step.parts.map((p, i) => `<text x="10" y="${30 + i * 26}" font-size="22" font-weight="700" fill="${COLORS[i % 6]}">${i + 1} ${p.quantity}x ${p.color} ${p.name}</text>`).join("");
  await sharp(jpeg).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}">${masks}${legend}</svg>`) }]).jpeg({ quality: 70 }).toFile(`${OUT}/step-${step.number}.jpg`);
}
