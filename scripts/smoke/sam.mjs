import { arg, dataUrl, postStream, save } from "./lib.mjs";

const image = arg(0, 'npm run smoke:sam -- path/to/photo.jpg "red 2x4 brick"');
const prompt = arg(1, "", "red 2x4 brick");
const imageUrl = await dataUrl(image);

const { text, seconds } = await postStream("/responses", {
  model: "sam-3.1",
  input: [
    {
      type: "message",
      role: "user",
      content: [
        { type: "input_text", text: prompt },
        { type: "input_image", image_url: imageUrl },
      ],
    },
  ],
});

const boxPattern = /(\d+)<\|box;x1=(\d+);y1=(\d+);x2=(\d+);y2=(\d+);w=(\d+);h=(\d+)/g;
const boxes = [...text.matchAll(boxPattern)].map(([, id, x1, y1, x2, y2, w, h]) => ({
  id,
  x1: +x1,
  y1: +y1,
  x2: +x2,
  y2: +y2,
  w: +w,
  h: +h,
}));

console.log(`"${prompt}": ${boxes.length} match(es) in ${seconds}s`);
for (const b of boxes) console.log(`  #${b.id} (${b.x1}, ${b.y1}) → (${b.x2}, ${b.y2})`);

if (boxes.length > 0) {
  const { w, h } = boxes[0];
  const rects = boxes
    .map(
      (b) =>
        `<rect x="${b.x1}" y="${b.y1}" width="${b.x2 - b.x1}" height="${b.y2 - b.y1}" fill="#E4FF3A" fill-opacity="0.45" stroke="#141414" stroke-width="${Math.max(2, w / 200)}"/>`,
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><image href="${imageUrl}" width="${w}" height="${h}"/>${rects}</svg>`;
  console.log(`Overlay: ${await save("sam-overlay.svg", svg)}`);
}
await save("sam-raw.txt", text);
