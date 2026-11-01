// Eval of /api/ahead on the demo photos: how far the build got, so Flow can skip steps built ahead.
// Usage: node scripts/smoke/ahead.mjs (needs the app on localhost:3100)
import fs from "fs";
const S = [
  { instruction: "Snap the red 2x4 brick onto the green baseplate.", check: "The red brick sits on the green baseplate." },
  { instruction: "Snap the blue 2x2 brick on top of the red brick.", check: "The blue brick sits on top of the red brick." },
  { instruction: "Snap the yellow 2x4 brick on top of the blue brick.", check: "The yellow brick sits on top of the blue brick." },
];
const cases = [["parts.jpg", 0, 0], ["step1.jpg", 0, 1], ["wrong.jpg", 1, 0], ["step2.jpg", 1, 1], ["step3.jpg", 1, 2], ["step3.jpg", 0, 3]];
let bad = 0;
for (const [file, from, want] of cases) {
  const image = "data:image/jpeg;base64," + fs.readFileSync(`public/demo/${file}`).toString("base64");
  const r = await fetch("http://localhost:3100/api/ahead", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image, steps: S.slice(from) }) });
  const { done } = await r.json();
  if (done !== want) bad++;
  console.log(done === want ? "PASS" : "FAIL", file, "from step", from + 1, "→ done", done, "want", want);
}
console.log(bad ? `${bad} failed` : "all passed");
