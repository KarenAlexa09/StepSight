import { mkdir, readFile, writeFile } from "node:fs/promises";

const OUT = "smoke-output/demo";
const SAME = "Same top-down smartphone photo, same light wooden table, same lighting and camera angle, generic toy building bricks with no logos and no text. ";

async function edit(source, prompt) {
  const form = new FormData();
  form.append("model", "muse-image-1.0");
  form.append("prompt", SAME + prompt);
  form.append("size", "1024x1024");
  form.append("output_format", "png");
  form.append("image", new Blob([source], { type: "image/png" }), "in.png");
  return request("/images/edits", form);
}

async function request(path, body) {
  const res = await fetch(`https://api.meta.ai/v1${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY}`, ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }) },
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path} ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  return Buffer.from(json.data[0].b64_json, "base64");
}

async function save(name, data) {
  await writeFile(`${OUT}/${name}.png`, data);
  console.log(name, "ok");
  return data;
}

await mkdir(OUT, { recursive: true });

const parts = await save(
  "parts",
  await request("/images/generations", {
    model: "muse-image-1.0",
    size: "1024x1024",
    output_format: "png",
    prompt:
      SAME +
      "Four loose pieces spread apart on the table: one flat green baseplate, one red 2x4 brick, one blue 2x2 brick and one yellow 2x4 brick. Nothing else on the table.",
  }),
);

const step1 = await save(
  "step1",
  await edit(parts, "Now the red 2x4 brick is snapped onto the green baseplate. The blue 2x2 and the yellow 2x4 stay loose on the table."),
);

await Promise.all([
  (async () => save("wrong", await edit(step1, "The blue 2x2 brick is lying loose on the table next to the baseplate, not attached to anything. The yellow 2x4 stays loose.")))(),
  (async () => {
    const step2 = await save("step2", await edit(step1, "Now the blue 2x2 brick is snapped on top of the red brick. The yellow 2x4 stays loose."));
    await save("step3", await edit(step2, "Now the yellow 2x4 brick is snapped on top of the blue brick. Everything is assembled, no loose pieces left."));
  })(),
]);
