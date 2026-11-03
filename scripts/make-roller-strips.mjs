// Draws the Miniso road roller's step strips (set 21015) from its paper booklet panels, one strip per one-action step in lib/known.ts.
// Usage: node --env-file=.env --experimental-strip-types scripts/make-roller-strips.mjs [steps like 2,5]   → public/manuals/21015/anim-<n>.jpg
// Source panels: scripts/manuals/21015/<booklet step>.jpg.
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { rollerSteps } from "../lib/known.ts";

const DIR = "scripts/manuals/21015";

// Each booklet panel is cropped to its model (dropping the parts box and step number) and used for all three panels:
// the next panel can't be the "after", it already shows the next step's pieces arriving.
async function tile(n) {
  const img = sharp(`${DIR}/${n}.jpg`);
  const { width, height } = await img.metadata();
  const top = Math.round(height * 0.38);
  return img.extract({ left: 0, top, width, height: height - top }).resize(512, 512, { fit: "contain", background: "#ffffff" }).toBuffer();
}

async function strip(n) {
  const a = await tile(n);
  return sharp({ create: { width: 1536, height: 512, channels: 3, background: "#ffffff" } })
    .composite([0, 512, 1024].map((left) => ({ input: a, left, top: 0 })))
    .png()
    .toBuffer();
}

async function draw(n) {
  const step = rollerSteps[n - 1];
  const form = new FormData();
  form.append("model", "muse-image-1.0");
  form.append(
    "prompt",
    "This is a strip of 3 square panels from a toy brick building booklet. Redraw all three as one minimal instructional illustration: " +
      "thin black outlines on a pure white background, every piece filled with its own flat color (yellow, black, dark gray, clear), " +
      "the model kept as drawn, with the same pieces, shapes, colors and angle. " +
      `This strip shows only one action: two simple outlined hands ${step.draw}. ` +
      "Panel 1: the model before this action, with only those new pieces lying loose beside it. Panel 2: the hands doing it. " +
      "Panel 3: the result, those pieces pressed into place, no hands. Leave out any other new piece the booklet shows. Same model and camera angle in all three. " +
      "Hands are thin outlines only, not filled, no skin color. No text, no numbers, no arrows, no boxes, no divider lines between panels, no shadows, no background.",
  );
  form.append("size", "1536x512");
  form.append("output_format", "jpeg");
  form.append("image", new Blob([await strip(step.panel)], { type: "image/png" }), "strip.png");
  for (let tries = 1; tries <= 3; tries++) {
    const res = await fetch("https://api.meta.ai/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY}` }, body: form });
    const json = await res.json();
    // The content filter sometimes flags these toy-brick prompts at random; a retry usually passes.
    if (!res.ok && tries < 3) continue;
    if (!res.ok) throw new Error(`strip ${n}: ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
    await writeFile(`public/manuals/21015/anim-${n}.jpg`, Buffer.from(json.data[0].b64_json, "base64"));
    return console.log("anim", n, "ok");
  }
}

await mkdir("public/manuals/21015", { recursive: true });
const only = process.argv[2] ? process.argv[2].split(",").map(Number) : null;
const todo = rollerSteps.map((_, i) => i + 1).filter((n) => !only || only.includes(n));
// Three at a time stays under the image rate limit.
for (let i = 0; i < todo.length; i += 3) await Promise.all(todo.slice(i, i + 3).map((n) => draw(n).catch((e) => console.log(e.message))));
