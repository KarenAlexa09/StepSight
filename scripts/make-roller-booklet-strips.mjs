// Builds the road roller's step animations (set 21015) from its own booklet, so every piece is right:
// before (the model after the last booklet step) → the booklet panel redrawn clean, pieces and arrows → after.
// Inputs: scripts/manuals/21015/clean/<n>.jpg (booklet panel traced by Muse Image) and after-<n>.jpg (same, pieces in place).
// Usage: node --experimental-strip-types scripts/make-roller-booklet-strips.mjs   → public/manuals/21015/anim-<step>.jpg
import sharp from "sharp";
import { rollerSteps } from "../lib/known.ts";

const DIR = "scripts/manuals/21015/clean";
const tile = (path) => sharp(path).resize(512, 512, { fit: "contain", background: "#ffffff" }).flatten({ background: "#ffffff" }).toBuffer();

for (const [i, step] of rollerSteps.entries()) {
  const n = step.panel;
  // Booklet step 1 has nothing before it: its loose pieces hold for two frames, then snap together.
  const before = await tile(n === 1 ? `${DIR}/1.jpg` : `${DIR}/after-${n - 1}.jpg`);
  const frames = [before, await tile(`${DIR}/${n}.jpg`), await tile(`${DIR}/after-${n}.jpg`)];
  await sharp({ create: { width: 1536, height: 512, channels: 3, background: "#ffffff" } })
    .composite(frames.map((input, k) => ({ input, left: k * 512, top: 0 })))
    .jpeg({ quality: 86 })
    .toFile(`public/manuals/21015/anim-${i + 1}.jpg`);
}
console.log("strips", rollerSteps.length);
