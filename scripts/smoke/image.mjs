import { post, save } from "./lib.mjs";

const prompt =
  "Cute beaver mascot character, hand-drawn black ink doodle style, thick uneven black outlines, white body, " +
  "two big front teeth, flat paddle tail with lavender (#C9C3F5) cross-hatch, simple dot eyes, friendly expression, " +
  "front view, standing, on plain cream paper background (#FBF7EF), no shading, no gradients, minimal flat " +
  "illustration, original character";

const { json, seconds } = await post("/images/generations", {
  model: "muse-image-1.0",
  prompt,
  size: "1024x1024",
  output_format: "png",
});

const path = await save("timber-master.png", Buffer.from(json.data[0].b64_json, "base64"));
console.log(`Saved ${path} · ${seconds}s`);
