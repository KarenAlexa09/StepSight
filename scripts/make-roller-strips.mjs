// Draws the Miniso road roller's step strips (set 21015), one per one-action step in lib/known.ts, as a chain:
// each strip starts from the last panel of the one before, so the model carries over, and the booklet panel shows where pieces go.
// Every strip is drawn up to 3 times and graded by scripts/lab/strips.mjs; the best one is kept.
// Usage: node --env-file=.env --experimental-strip-types scripts/make-roller-strips.mjs [from step, default 2] [to step]
//   → public/manuals/21015/anim-<n>.jpg (step 1 is kept as is: it starts from the booklet, nothing before it)
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { LOOKS, rollerSteps } from "../lib/known.ts";
import { grade } from "./lab/strips.mjs";

const DIR = "scripts/manuals/21015";
const OUT = "public/manuals/21015";
const TRIES = 3;

// The booklet panel, cropped to its model (the parts box and step number are left out).
async function booklet(n) {
  const img = sharp(`${DIR}/${n}.jpg`);
  const { width, height } = await img.metadata();
  const top = Math.round(height * 0.38);
  return img.extract({ left: 0, top, width, height: height - top }).resize(512, 512, { fit: "contain", background: "#ffffff" }).toBuffer();
}

// The last panel of a strip: the model as it stands after that step.
async function result(path) {
  const img = sharp(path);
  const { width, height } = await img.metadata();
  const w = Math.round(width / 3);
  return img.extract({ left: width - w, top: 0, width: w, height }).resize(512, 512, { fit: "contain", background: "#ffffff" }).toBuffer();
}

async function input(n) {
  const before = await result(`${OUT}/anim-${n - 1}.jpg`);
  const ref = await booklet(rollerSteps[n - 1].panel);
  return sharp({ create: { width: 1536, height: 512, channels: 3, background: "#ffffff" } })
    .composite([{ input: before, left: 0, top: 0 }, { input: ref, left: 512, top: 0 }, { input: ref, left: 1024, top: 0 }])
    .png()
    .toBuffer();
}

function prompt(n) {
  const step = rollerSteps[n - 1];
  const pieces = step.parts.length
    ? step.parts.map((p) => `${p.quantity} x ${LOOKS[`${p.color} ${p.name}`] ?? `${p.color} ${p.name}`}`).join("; ")
    : "no new pieces";
  const turn = /turn it/i.test(step.en.instruction) ? "The model has been turned to the angle the booklet picture shows; use that angle in all three panels. " : "";
  return (
    "The input has 3 panels. Panel 1 is our clean drawing of a toy brick model as it is now. Panels 2 and 3 are the official booklet picture, a reference that shows where new pieces go (blue arrows). " +
    "Draw a new strip of 3 square panels in the exact style of input panel 1: thin black outlines, flat colors (yellow, black, dark gray, clear), pure white background. " +
    `${turn}Panel 1: the model exactly as in input panel 1, nothing added or removed, with only these new loose pieces lying beside it: ${pieces}. ` +
    `Panel 2: two simple thin-outlined hands ${step.draw}. ` +
    "Panel 3: the same model with those new pieces in place where the booklet shows them, no hands and no loose pieces left. " +
    "The model keeps the same size, shape and angle in all three panels; never add other pieces, never change the pieces already on it. " +
    "Hands are thin outlines only, not filled, no skin color. No text, no numbers, no arrows, no boxes, no divider lines, no shadows."
  );
}

async function draw(n, out) {
  const form = new FormData();
  form.append("model", "muse-image-1.0");
  form.append("prompt", prompt(n));
  form.append("size", "1536x512");
  form.append("output_format", "jpeg");
  form.append("image", new Blob([await input(n)], { type: "image/png" }), "strip.png");
  for (let tries = 1; tries <= 3; tries++) {
    const res = await fetch("https://api.meta.ai/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY}` }, body: form });
    const json = await res.json();
    if (res.ok) return writeFile(out, Buffer.from(json.data[0].b64_json, "base64"));
    // The content filter flags these toy-brick prompts at random; a retry usually passes.
    if (tries === 3) throw new Error(`strip ${n}: ${res.status} ${JSON.stringify(json).slice(0, 160)}`);
  }
}

await mkdir("smoke-output/chain", { recursive: true });
const from = Number(process.argv[2] ?? 2);
const to = Number(process.argv[3] ?? rollerSteps.length);
for (let n = from; n <= to; n++) {
  let best = null;
  for (let t = 1; t <= TRIES; t++) {
    const path = `smoke-output/chain/${n}-${t}.jpg`;
    try {
      await draw(n, path);
    } catch (e) {
      console.log(e.message);
      continue;
    }
    const g = await grade(n, path);
    console.log(`${n} try ${t}: score ${g.score}${g.problems.length ? " — " + g.problems.join("; ") : ""}`);
    if (!best || g.score > best.score) best = { ...g, path };
    if (g.score >= 5) break;
  }
  if (best) await copyFile(best.path, `${OUT}/anim-${n}.jpg`);
  console.log(`${n} kept score ${best?.score ?? "none"}`);
}
