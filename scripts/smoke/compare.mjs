import { arg, dataUrl, outputText, post } from "./lib.mjs";

const target = arg(0, "npm run smoke:compare -- path/to/manual-step.png path/to/my-build.jpg");
const photo = arg(1, "npm run smoke:compare -- path/to/manual-step.png path/to/my-build.jpg");

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["matches", "problem", "fix"],
  properties: {
    matches: { type: "boolean" },
    problem: { type: ["string", "null"] },
    fix: { type: ["string", "null"] },
  },
};

const { json, seconds } = await post("/responses", {
  model: "muse-spark-1.3",
  input: [
    {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text:
            "Image 1 is the target state of one step from an assembly manual. Image 2 is a photo of the " +
            "user's build. Does the build match the target? If not, describe the problem and the fix in one " +
            "short, friendly sentence each, naming parts by color and size.",
        },
        { type: "input_image", image_url: await dataUrl(target) },
        { type: "input_image", image_url: await dataUrl(photo) },
      ],
    },
  ],
  text: { format: { type: "json_schema", name: "step_check", schema, strict: true } },
});

console.log(JSON.parse(outputText(json)));
console.log(`\n${seconds}s · ${json.usage?.total_tokens ?? "?"} tokens`);
