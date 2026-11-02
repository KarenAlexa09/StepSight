// Draws the Miniso road roller's step strips (set 21015) from its paper booklet panels, in the same style as every other step drawing.
// Usage: node --env-file=.env scripts/make-roller-strips.mjs [step]   → public/manuals/21015/anim-<n>.jpg
// Source panels: scripts/manuals/21015/<n>.jpg.
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const DIR = "scripts/manuals/21015";
// What each step adds, so the hands place the right pieces.
const ADDS = [
  "the dark gray 2x3 plate pressed onto two black L-shaped corner plates",
  "a black 2x2 plate and two yellow bricks with holes on top, two small black brackets under the front",
  "a black brick with a wheel pin set beside the yellow bricks, joined by a dark gray plate on top",
  "black plates covering the top, a small black bracket and a yellow hexagon block on the side",
  "a yellow 2x4 plate on top, yellow hexagon blocks on the sides and a yellow beam on the side pin",
  "a yellow 2x2 plate and two curved yellow slopes on top, like a hood",
  "a clear 2x2 window brick, a yellow windscreen and two grille slopes forming the cab",
  "a black roller made of five drum pieces on a long axle, pushed through the yellow beam at the front",
  "two black tires with yellow rims pressed onto the back pins and a yellow tile on the roof",
];

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
  const form = new FormData();
  form.append("model", "muse-image-1.0");
  form.append(
    "prompt",
    "This is a strip of 3 square panels from a toy brick building booklet. Redraw all three as one minimal instructional illustration: " +
      "thin black outlines on a pure white background, every piece filled with its own flat color (yellow, black, dark gray, clear), " +
      "the model kept exactly as drawn in each panel, with the same pieces, shapes, colors and angle; nothing added or removed. " +
      `Panel 1: the model with the new pieces lying loose beside it. Panel 2: two simple outlined hands placing them: ${ADDS[n - 1]}. ` +
      "Panel 3: the finished result, the new pieces pressed into place exactly where the blue arrows point, no hands. Same model and camera angle in all three. " +
      "Hands are thin outlines only, not filled, no skin color. No text, no numbers, no arrows, no boxes, no divider lines between panels, no shadows, no background.",
  );
  form.append("size", "1536x512");
  form.append("output_format", "jpeg");
  form.append("image", new Blob([await strip(n)], { type: "image/png" }), "strip.png");
  const res = await fetch("https://api.meta.ai/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY}` }, body: form });
  const json = await res.json();
  if (!res.ok) throw new Error(`strip ${n}: ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  await writeFile(`public/manuals/21015/anim-${n}.jpg`, Buffer.from(json.data[0].b64_json, "base64"));
  console.log("anim", n, "ok");
}

await mkdir("public/manuals/21015", { recursive: true });
const only = Number(process.argv[2]);
const todo = ADDS.map((_, i) => i + 1).filter((n) => !only || n === only);
// Three at a time stays under the image rate limit.
for (let i = 0; i < todo.length; i += 3) await Promise.all(todo.slice(i, i + 3).map(draw));
