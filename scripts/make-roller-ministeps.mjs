// One animation per one-action step of the road roller (set 21015), so only that step's pieces move:
// before (the model as it is now) → the new pieces floating just above their spots with arrows → after.
// Built only by small edits of the booklet traces in scripts/manuals/21015/clean (<n>.jpg, after-<n>.jpg):
// "remove these pieces" for in-between states, "lift these pieces" for the arrow frame. Nothing is drawn from scratch.
// Usage: node --env-file=.env scripts/make-roller-ministeps.mjs [states|arrows|strips] [steps like 2,4]
import { copyFile, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const DIR = "scripts/manuals/21015/clean";

// state: how the model looks after the step. "after-<n>" is a booklet trace; "remove" edits it.
// arrive: the frame with the new pieces lifted ("lift" edits the state; "panel" uses the booklet trace as is).
// arrive-2 and state-6 were picked by hand from extra tries (an "add" edit on state-1, and a second removal on a first try).
const STEPS = [
  { state: "after-1", arrive: { panel: 1 } },
  { state: "after-2", remove: "the two small black pieces hanging under the front of the model (below the yellow bricks), so nothing sticks out underneath; the base plates, the black 2x2 plate and the two yellow bricks stay", lift: "exactly three pieces, each only once: the black 2x2 plate in the middle and the two yellow bricks with holes on its sides. The gray-and-black base stays on the table with nothing on top" },
  { state: "after-2", arrive: { panel: 2 } },
  { state: "after-3", remove: "only two pieces: the big black brick on the right (the one with the white pin) and the dark gray plate lying across the top. Keep everything under them: the black and gray base plates, the black 2x2 plate, both yellow bricks with their black pins and the small black pieces underneath", lift: "the two short black pins in the yellow bricks' holes" },
  { state: "after-3", arrive: { panel: 3 } },
  { state: "after-4", remove: "the loose-looking yellow hexagon-shaped cube at the bottom front and the round yellow ring on the black pin at the left end, plus the little black piece on top at the back. The yellow brick at the left end stays yellow and the black pin stays, now bare", lift: "the two flat black plates lying on top of the model (one long, one square), so they float above it with their arrows. All bricks underneath stay" },
  { state: "after-4", remove: "the small yellow cube on the side and the small black brackets on top", lift: "the two small yellow rings on the black pins" },
  { state: "after-4", arrive: { panel: 4 } },
  { state: "after-5", remove: "the small yellow cube-shaped pieces on the sides, the small yellow L piece and the long yellow beam", lift: "the yellow 2x4 plate on top" },
  { state: "after-5", remove: "the long yellow beam on the side", lift: "the small yellow cube-shaped pieces on the sides" },
  { state: "after-5", lift: "the long yellow beam with round holes on the side" },
  { state: "after-6", remove: "the two curved yellow slopes on top", lift: "the yellow 2x2 plate and the two tiny rounded yellow pieces on top" },
  { state: "after-6", lift: "the two curved yellow slopes on top" },
  { state: "after-7", remove: "the two grille slopes and the flat yellow tile on top", lift: "the clear window brick and the yellow windscreen frame" },
  { state: "after-7", arrive: { panel: 7 } },
  { state: "after-8", remove: "the black roller at the front: show it as a finished roller of five drums on its axle lying on the table beside the model", arrive: { panel: 8 } },
  { state: "after-8", lift: "the black roller (five drums on an axle), off the model and floating in front of the yellow beam's end hole" },
  { state: "after-9", remove: "the yellow beam on the far end of the roller and the flat yellow tile on the roof", lift: "the two wheels (yellow rims in black tires) off the back pins" },
  { state: "after-9", lift: "the yellow beam on the far end of the roller and the flat yellow tile on the roof" },
];

const STYLE = "Keep the same model, angle, size, colors and clean style (thin black outlines, flat colors, white background). Change nothing else. No text, no numbers.";

async function edit(prompt, from, to) {
  const form = new FormData();
  form.append("model", "muse-image-1.0");
  form.append("prompt", `${prompt} ${STYLE}`);
  form.append("size", "1024x1024");
  form.append("output_format", "jpeg");
  form.append("image", new Blob([await readFile(from)], { type: "image/jpeg" }), "in.jpg");
  for (let t = 0; t < 3; t++) {
    const res = await fetch("https://api.meta.ai/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY}` }, body: form });
    const json = await res.json();
    if (res.ok) return writeFile(to, Buffer.from(json.data[0].b64_json, "base64"));
  }
  console.log("failed", to);
}

const statePath = (k) => `${DIR}/state-${k}.jpg`;
const arrivePath = (k) => `${DIR}/arrive-${k}.jpg`;
const mode = process.argv[2] ?? "strips";
const only = process.argv[3] ? process.argv[3].split(",").map(Number) : null;
const todo = STEPS.map((_, i) => i + 1).filter((k) => !only || only.includes(k));

async function inBatches(list, fn) {
  for (let i = 0; i < list.length; i += 3) await Promise.all(list.slice(i, i + 3).map(fn));
}

if (mode === "states") {
  await inBatches(todo, async (k) => {
    const s = STEPS[k - 1];
    if (s.remove) await edit(`This is a toy brick building instruction picture. Remove ${s.remove}. Everything else stays exactly as it is.`, `${DIR}/${s.state}.jpg`, statePath(k));
    else await copyFile(`${DIR}/${s.state}.jpg`, statePath(k));
    console.log("state", k);
  });
}

if (mode === "arrows") {
  await inBatches(todo, async (k) => {
    const s = STEPS[k - 1];
    if (s.arrive) await copyFile(`${DIR}/${s.arrive.panel}.jpg`, arrivePath(k));
    else await edit(`This is a toy brick building instruction picture. Lift ${s.lift} straight up off the model so they float a little above their spots, with one blue arrow from each down to where it goes, like a building booklet. Every other piece stays exactly where it is.`, statePath(k), arrivePath(k));
    console.log("arrive", k);
  });
}

if (mode === "strips") {
  // The model fills each frame: one crop box (the union of what's drawn in all three) so it doesn't jump between frames.
  // Separate pipelines: sharp keeps one resize per pipeline and trims before it resizes.
  const square = (path) => sharp(path).resize(1024, 1024, { fit: "contain", background: "#ffffff" }).flatten({ background: "#ffffff" }).toBuffer();
  const box = async (path) => {
    const { info } = await sharp(await square(path)).trim({ threshold: 30 }).toBuffer({ resolveWithObject: true });
    return { left: -info.trimOffsetLeft, top: -info.trimOffsetTop, right: -info.trimOffsetLeft + info.width, bottom: -info.trimOffsetTop + info.height };
  };
  const tile = async (path, b) =>
    sharp(await square(path))
      .extract({ left: b.left, top: b.top, width: b.right - b.left, height: b.bottom - b.top })
      .resize(460, 460, { fit: "contain", background: "#ffffff" })
      .extend({ top: 26, bottom: 26, left: 26, right: 26, background: "#ffffff" })
      .toBuffer();
  for (const k of todo) {
    const paths = [k === 1 ? arrivePath(1) : statePath(k - 1), arrivePath(k), statePath(k)];
    const boxes = await Promise.all(paths.map(box));
    const pad = 20;
    const union = {
      left: Math.max(0, Math.min(...boxes.map((b) => b.left)) - pad),
      top: Math.max(0, Math.min(...boxes.map((b) => b.top)) - pad),
      right: Math.min(1024, Math.max(...boxes.map((b) => b.right)) + pad),
      bottom: Math.min(1024, Math.max(...boxes.map((b) => b.bottom)) + pad),
    };
    const frames = await Promise.all(paths.map((p) => tile(p, union)));
    await sharp({ create: { width: 1536, height: 512, channels: 3, background: "#ffffff" } })
      .composite(frames.map((input, i) => ({ input, left: i * 512, top: 0 })))
      .jpeg({ quality: 86 })
      .toFile(`public/manuals/21015/anim-${k}.jpg`);
  }
  console.log("strips", todo.length);
}
