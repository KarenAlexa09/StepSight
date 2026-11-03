// Drawing lab for the road roller: Muse Spark grades every step strip against its booklet panel, instruction and pieces.
// Usage: node --env-file=.env --experimental-strip-types scripts/lab/strips.mjs [steps like 2,7] [dir]
// Prints a score (1–5) and the problems per strip; JSON in smoke-output/strips-lab.json.
import { readFile, writeFile } from "node:fs/promises";
import { rollerSteps } from "../../lib/known.ts";

const only = process.argv[2] ? process.argv[2].split(",").map(Number) : null;
const dir = process.argv[3] ?? "public/manuals/21015";
const url = async (path) => `data:image/jpeg;base64,${(await readFile(path)).toString("base64")}`;

export async function grade(n, stripPath = `${dir}/anim-${n}.jpg`) {
  const step = rollerSteps[n - 1];
  const parts = step.parts.map((p) => `${p.quantity}x ${p.color} ${p.name}`).join(", ") || "no new pieces";
  const res = await fetch("https://api.meta.ai/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "muse-spark-1.3",
      reasoning: { effort: "low" },
      input: [{ role: "user", type: "message", content: [
        { type: "input_text", text:
          `You review step drawings for a toy brick building app. The first image is the official booklet picture this step comes from (it may show more pieces arriving than this one step). ` +
          `The second image is our 3-panel drawing for ONE step: panel 1 the model before, panel 2 hands doing it, panel 3 the result.\n` +
          `Step: "${step.en.instruction}". New pieces in this step: ${parts}. What the hands should do: ${step.draw}.\n` +
          "Grade strictly for a beginner who follows only the drawing. right_action: the hands do exactly this step. right_pieces: the new pieces have the right count, color and shape (no extra or missing pieces). " +
          "matches_booklet: the model looks like the booklet's model (same shapes, colors and layout), not a different or cartoon object. consistent: all three panels show the same model from the same angle. " +
          "score 1 to 5 (5 = a beginner gets it right from the drawing alone). problems: short list of what is wrong, empty if nothing." },
        { type: "input_image", image_url: await url(`scripts/manuals/21015/${step.panel}.jpg`) },
        { type: "input_image", image_url: await url(stripPath) },
      ] }],
      text: { format: { type: "json_schema", name: "grade", strict: true, schema: { type: "object", additionalProperties: false, required: ["right_action", "right_pieces", "matches_booklet", "consistent", "score", "problems"], properties: { right_action: { type: "boolean" }, right_pieces: { type: "boolean" }, matches_booklet: { type: "boolean" }, consistent: { type: "boolean" }, score: { type: "integer" }, problems: { type: "array", items: { type: "string" } } } } } },
    }),
  });
  const data = await res.json();
  const text = (data.output ?? []).flatMap((o) => o.content ?? []).filter((c) => c.type === "output_text").map((c) => c.text).join("");
  return JSON.parse(text);
}

// Run as a script only when called directly (make-roller-strips.mjs imports grade()).
if (/[\\/]lab[\\/]strips\.mjs$/.test(process.argv[1])) {
  const todo = rollerSteps.map((_, i) => i + 1).filter((n) => !only || only.includes(n));
  const results = {};
  for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(todo.slice(i, i + 4).map(async (n) => {
      results[n] = await grade(n);
    }));
  }
  for (const n of todo) {
    const r = results[n];
    const flags = ["right_action", "right_pieces", "matches_booklet", "consistent"].filter((k) => !r[k]).join(", ");
    console.log(`${String(n).padStart(2)} score ${r.score} ${flags ? `(fails: ${flags})` : ""}${r.problems.length ? " — " + r.problems.join("; ") : ""}`);
  }
  await writeFile("smoke-output/strips-lab.json", JSON.stringify(results, null, 2));
}
