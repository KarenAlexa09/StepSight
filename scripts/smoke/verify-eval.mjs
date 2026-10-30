import { readdir, readFile } from "node:fs/promises";

// Usage: node scripts/smoke/verify-eval.mjs <folder> [baseUrl]
// <folder> holds step.json ({instruction, check, parts}), good/*.jpg (step done) and bad/*.jpg (step not done).
const [dir, base = "http://localhost:3000"] = process.argv.slice(2);
if (!dir) {
  console.log("Usage: node scripts/smoke/verify-eval.mjs <folder> [baseUrl]");
  process.exit(1);
}

const step = JSON.parse(await readFile(`${dir}/step.json`, "utf8"));
let right = 0;
let total = 0;

for (const [folder, expected] of [["good", true], ["bad", false]]) {
  const files = (await readdir(`${dir}/${folder}`).catch(() => [])).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
  for (const file of files) {
    const bytes = await readFile(`${dir}/${folder}/${file}`);
    const type = file.toLowerCase().endsWith("png") ? "png" : file.toLowerCase().endsWith("webp") ? "webp" : "jpeg";
    const res = await fetch(`${base}/api/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: `data:image/${type};base64,${bytes.toString("base64")}`, step }),
    });
    const result = await res.json();
    if (!res.ok) {
      console.log(folder, file, "ERROR", result.error);
      continue;
    }
    total++;
    const ok = result.done === expected;
    if (ok) right++;
    console.log(ok ? "ok  " : "MISS", folder, file, `done=${result.done}`, `confidence=${result.confidence}`, `seen: ${result.seen}`);
    await new Promise((r) => setTimeout(r, 1600));
  }
}

console.log(`\n${right}/${total} correct${total ? ` (${Math.round((right / total) * 100)}%)` : ""}`);
