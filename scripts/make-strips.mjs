// Draws the tower demo's step strips from its real photos, so every panel shows the same bricks where they really are.
// Usage: node --env-file=.env scripts/make-strips.mjs [1|2|3]   → public/demo/anim-tower-<n>.jpg
import { writeFile } from "node:fs/promises";
import sharp from "sharp";

const PHOTOS = ["parts", "step1", "step2", "step3"].map((name) => `public/demo/${name}.jpg`);
// [piece, where it goes, what panel 1 shows]: the layout spelled out keeps the model from zooming in or dropping a brick.
const STEPS = [
  ["the red 2x4 brick", "the green baseplate", "four loose bricks on the table: red top left, blue top right, green plate bottom left, yellow bottom right"],
  ["the small blue 2x2 brick", "the top of the red brick", "the red brick on the green plate at bottom left, the blue brick top right, the yellow brick bottom right"],
  ["the yellow 2x4 brick", "the top of the blue brick", "a small stack at bottom left (green plate, red brick on it, small blue brick on the red) and the yellow brick lying alone on the table at bottom right; the rest of the table is empty"],
];

// Panels 1 and 2 start from the photo before the step, panel 3 is the photo after it.
async function strip(before, after) {
  const tile = (path) => sharp(path).resize(512, 512).toBuffer();
  const [a, b] = await Promise.all([tile(before), tile(after)]);
  return sharp({ create: { width: 1536, height: 512, channels: 3, background: "#ffffff" } })
    .composite([
      { input: a, left: 0, top: 0 },
      { input: a, left: 512, top: 0 },
      { input: b, left: 1024, top: 0 },
    ])
    .png()
    .toBuffer();
}

async function draw(n) {
  const [piece, target, layout] = STEPS[n - 1];
  const form = new FormData();
  form.append("model", "muse-image-1.0");
  form.append(
    "prompt",
    "This is a strip of 3 square panels of the same table seen from directly above. Redraw all three as one minimal instructional illustration: " +
      "thin black outlines on a pure white background, every brick filled with its own flat color (red, blue, yellow, green), " +
      "each brick kept exactly where it is in the photo, with the same size, shape, stud count and color; nothing added or removed. " +
      `Panel 1: exactly as in the photo: ${layout}. Keep the same zoom and framing as the photo. Panel 2: the same layout, but two simple outlined hands lift ${piece} and hold it just above ${target}. ` +
      `Panel 3: exactly as in the photo, ${piece} sitting on ${target}. Same camera angle in all three, no text, no numbers, no shadows.`,
  );
  form.append("size", "1536x512");
  form.append("output_format", "jpeg");
  form.append("image", new Blob([await strip(PHOTOS[n - 1], PHOTOS[n])], { type: "image/png" }), "strip.png");
  const res = await fetch("https://api.meta.ai/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY}` },
    body: form,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`strip ${n}: ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  await writeFile(`public/demo/anim-tower-${n}.jpg`, Buffer.from(json.data[0].b64_json, "base64"));
  console.log("anim-tower", n, "ok");
}

const only = Number(process.argv[2]);
await Promise.all([1, 2, 3].filter((n) => !only || n === only).map(draw));
