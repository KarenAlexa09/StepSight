// Generates the lab's test photos with Muse Image (kept in the repo so runs are repeatable).
// Usage: node --env-file=.env scripts/lab/photos.mjs [name]
import { mkdir, writeFile } from "node:fs/promises";

const PHONE = "A realistic smartphone photo taken at home, natural light, slightly imperfect framing. ";

const PHOTOS = {
  "bricks-dusty": "A pile of colorful plastic toy building bricks on a wooden table, visibly covered in dust and lint, no logos and no text.",
  "yellow-pot":
    "A finished model built from yellow plastic toy bricks: a square yellow plant pot with a cute smiling face, two short legs, curved pipe arms, and dark green pointed leaves on top. Only this one model, on a white desk.",
  "washer-error": "Close-up of a front-loading washing machine's control panel; the small digital display clearly shows the error code E21. No brand logo visible.",
  "bike-chain": "Close-up of a bicycle's front gears where the chain has fallen off the chainring and hangs loose. A garage floor in the background.",
  "rubber-duck": "A plain yellow rubber bath duck sitting on the edge of a white bathtub, no logos and no text.",
  "watch-side": "Side view of a smartwatch with a gold aluminum case and a light pink sport band, held in a hand over a pink fleece blanket; the round digital crown and the flat oval side button below it are visible on the right edge. No logos.",
  "clock-front": "A simple round white wall clock with black hands and numbers, lying face up on a kitchen table; the second hand is stuck. No logos and no text besides the numbers.",
  "clock-back": "The back of a round white plastic wall clock lying face down on a table, showing the battery compartment and a small white sticker that clearly reads: IKEA  TROMMA  Made in China.",
  "sticker-only": "Extreme close-up of a small white product sticker on flat white plastic, filling the frame; it clearly reads: IKEA  TROMMA  Made in China. Nothing else is visible.",
  "headphones-label":
    "Close-up of the inside of a black over-ear headphone headband, with a small printed label that clearly reads: SONY  Model: WH-1000XM4.",
};

const only = process.argv[2];
await mkdir("scripts/lab/photos", { recursive: true });
await Promise.all(
  Object.entries(PHOTOS)
    .filter(([name]) => !only || name === only)
    .map(async ([name, prompt]) => {
      const res = await fetch("https://api.meta.ai/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "muse-image-1.0", prompt: PHONE + prompt, size: "1024x1024", output_format: "jpeg" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(`${name}: ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
      await writeFile(`scripts/lab/photos/${name}.jpg`, Buffer.from(json.data[0].b64_json, "base64"));
      console.log(name, "ok");
    }),
);
