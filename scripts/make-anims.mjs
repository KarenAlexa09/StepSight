// Draws the demo step animations once (needs `npm run dev` running) into public/demo/anim-<demo>-<n>.jpg.
// Usage: node scripts/make-anims.mjs [http://localhost:3000]
import { writeFile } from "node:fs/promises";

const base = process.argv[2] || "http://localhost:3000";
const DEMOS = {
  lamp: {
    title: "table lamp",
    steps: [
      ["Unplug the lamp from the power strip.", "plug"],
      ["Lift the lampshade off the lamp.", "lampshade"],
      ["Unscrew the old bulb and take it out.", "light bulb"],
      ["Screw in the new bulb and put the shade back on.", "light bulb"],
    ],
  },
  tower: {
    title: "toy brick tower",
    steps: [
      ["Snap the red 2x4 brick onto the green baseplate.", "red brick"],
      ["Snap the blue 2x2 brick on top of the red brick.", "blue brick"],
      ["Snap the yellow 2x4 brick on top of the blue brick.", "yellow brick"],
    ],
  },
};

await Promise.all(
  Object.entries(DEMOS).flatMap(([demo, { title, steps }]) =>
    steps.map(async ([instruction, target], i) => {
      const t = performance.now();
      const res = await fetch(`${base}/api/animate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, instruction, target }),
      });
      const data = await res.json();
      if (!res.ok) return console.log(demo, i + 1, "FAILED", data.error);
      await writeFile(`public/demo/anim-${demo}-${i + 1}.jpg`, Buffer.from(data.image.split(",")[1], "base64"));
      console.log(demo, i + 1, `${((performance.now() - t) / 1000).toFixed(1)}s`);
    }),
  ),
);
