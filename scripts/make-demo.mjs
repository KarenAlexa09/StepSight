import { mkdir, readFile, writeFile } from "node:fs/promises";

const OUT = "smoke-output/demo";
let SAME = "Same top-down smartphone photo, same light wooden table, same lighting and camera angle, generic toy building bricks with no logos and no text. ";

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

if (process.argv[2] === "lamp") {
  SAME = "Same top-down smartphone photo, same light wooden table, same lighting and camera angle, a small white table lamp, no logos and no text. ";
  const kept = (name) => readFile(`${OUT}/${name}.png`).catch(() => null);
  const lamp0 =
    (await kept("lamp0")) ??
    (await save(
      "lamp0",
      await request("/images/generations", {
        model: "muse-image-1.0",
        size: "1024x1024",
        output_format: "png",
        prompt:
          SAME +
          "The lamp has a round fabric lampshade and a bulb inside. Its black cord runs to a black plug that is plugged into a white wall power strip lying on the table. A new boxed light bulb sits on the table next to the lamp.",
      }),
    ));
  await Promise.all([
    (async () => (await kept("lamp-wrong")) ?? save("lamp-wrong", await edit(lamp0, "A hand is holding the lampshade, but the plug is still plugged into the power strip.")))(),
    (async () => {
      const lamp1 = await save(
        "lamp1",
        await edit(
          lamp0,
          "Now the lamp's black plug is pulled out and lies loose on the table, clearly apart from the power strip, with the black cord attached to it. Every socket on the power strip is empty. The lamp is switched off.",
        ),
      );
      const lamp2 = await save("lamp2", await edit(lamp1, "Now the lampshade is lifted off and placed on the table, so the bare bulb is visible on the lamp. The black plug stays loose, apart from the power strip."));
      const lamp3 = await save("lamp3", await edit(lamp2, "Now the old bulb is unscrewed and lies on the table, and the empty bulb socket is visible on the lamp."));
      await save("lamp4", await edit(lamp3, "Now the new bulb is screwed into the socket and the lampshade is back on top of the lamp. The empty box and the old bulb stay on the table."));
    })(),
  ]);
} else {
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
}
