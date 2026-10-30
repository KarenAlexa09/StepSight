import { readFile, writeFile, mkdir } from "node:fs/promises";

const MASTER = "smoke-output/timber-master.png";
const OUT = "smoke-output/poses";
const BASE = "Same beaver character, same hand-drawn black ink doodle style, same cream paper background, same proportions, with the lavender paddle tail standing upright behind his right side. ";

const POSES = {
  wave: "Now waving hello with one paw raised, smiling.",
  reading: "Now holding an open instruction booklet in both paws and reading it, looking down at it.",
  point: "Now pointing to the right with one paw, with an eager expression, as if showing where something is.",
  think: "Now with one paw on his chin, eyes looking up, thinking, small question mark above his head.",
  thumbs: "Now giving a big thumbs up with one paw, winking, very proud.",
  oops: "Now with both paws on his cheeks, surprised, small sweat drop, an 'oops' expression.",
  celebrate: "Now cheering happily with both paws raised high, big open smile, a few small sparkles around.",
  hardhat: "Now wearing a bright yellow-green construction hard hat, standing proud with paws on hips.",
  lean: "Now wearing a bright yellow-green construction hard hat, leaning forward with both forearms resting on a ledge in front of him, chin up, relaxed friendly smile, looking at the viewer. Crop the picture at his waist so only his upper body is visible and the bottom edge is straight and flat.",
};

await mkdir(OUT, { recursive: true });
const master = await readFile(MASTER);

await Promise.all(
  Object.entries(POSES)
    .filter(([name]) => !process.argv[2] || name === process.argv[2])
    .map(async ([name, change]) => {
    const form = new FormData();
    form.append("model", "muse-image-1.0");
    form.append("prompt", BASE + change);
    form.append("size", "1024x1024");
    form.append("output_format", "png");
    form.append("image", new Blob([master], { type: "image/png" }), "timber.png");
    const res = await fetch("https://api.meta.ai/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY}` },
      body: form,
    });
    const json = await res.json();
    if (!res.ok) {
      console.log(name, "FAILED", res.status, JSON.stringify(json).slice(0, 200));
      return;
    }
    await writeFile(`${OUT}/${name}.png`, Buffer.from(json.data[0].b64_json, "base64"));
    console.log(name, "ok");
  }),
);
