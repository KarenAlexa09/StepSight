import { arg, dataUrl, outputText, post, save } from "./lib.mjs";

const pdf = arg(0, "npm run smoke:manual -- path/to/manual.pdf");

const part = {
  type: "object",
  additionalProperties: false,
  required: ["name", "color", "quantity"],
  properties: {
    name: { type: "string" },
    color: { type: "string" },
    quantity: { type: "integer" },
  },
};

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "steps"],
  properties: {
    title: { type: "string" },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["number", "page", "instruction", "parts", "check"],
        properties: {
          number: { type: "integer" },
          page: { type: "integer" },
          instruction: { type: "string" },
          parts: { type: "array", items: part },
          check: { type: "string" },
        },
      },
    },
  },
};

const { json, seconds } = await post("/responses", {
  model: "muse-wonder-1.0",
  input: [
    {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text:
            "This is an assembly manual. Turn it into build steps. For each step give the page it is on, " +
            "one short instruction a beginner can follow, the parts added in that step, and what should be " +
            "visibly true when the step is done (check).",
        },
        { type: "input_file", filename: "manual.pdf", file_data: await dataUrl(pdf) },
      ],
    },
  ],
  text: { format: { type: "json_schema", name: "manual", schema, strict: true } },
});

const manual = JSON.parse(outputText(json));
const path = await save("manual-steps.json", JSON.stringify(manual, null, 2));

console.log(`${manual.title}: ${manual.steps.length} steps`);
for (const step of manual.steps.slice(0, 3)) {
  console.log(`\n${step.number} (p. ${step.page}) ${step.instruction}`);
  console.log(`  parts: ${step.parts.map((p) => `${p.quantity}× ${p.color} ${p.name}`).join(", ")}`);
  console.log(`  check: ${step.check}`);
}
console.log(`\nSaved ${path} · ${seconds}s · ${json.usage?.total_tokens ?? "?"} tokens`);
