import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";

const IN = "smoke-output/poses";
const OUT = "public/mascot";
const W = 512;

const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

function cutout(name) {
  const rgb = execFileSync("ffmpeg", ["-v", "error", "-i", `${IN}/${name}.png`, "-vf", `scale=${W}:-1`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], {
    maxBuffer: 1 << 28,
  });
  const H = rgb.length / (W * 3);
  const px = (i) => [rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]];

  const border = [];
  for (let x = 0; x < W; x++) border.push(px(x), px((H - 1) * W + x));
  for (let y = 0; y < H; y++) border.push(px(y * W), px(y * W + W - 1));
  const bg = [0, 1, 2].map((c) => Math.round(border.reduce((s, p) => s + p[c], 0) / border.length));
  // Stay well clear of the character's pure white body.
  const tolerance = Math.min(30, dist(bg, [255, 255, 255]) / 2);

  // Every paper-colored pixel goes, including pockets the border can't reach (between arm and body).
  const background = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (dist(px(i), bg) <= tolerance) background[i] = 1;

  // Two passes eat the light fringe left around anti-aliased ink lines.
  for (let pass = 0; pass < 2; pass++) {
    const next = background.slice();
    for (let i = 0; i < W * H; i++) {
      if (background[i]) continue;
      const x = i % W;
      const touches =
        (x > 0 && background[i - 1]) || (x < W - 1 && background[i + 1]) || (i >= W && background[i - W]) || (i < W * (H - 1) && background[i + W]);
      if (touches && dist(px(i), bg) <= 75) next[i] = 1;
    }
    background.set(next);
  }

  const rgba = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const x = i % W;
    const edge =
      !background[i] &&
      ((x > 0 && background[i - 1]) || (x < W - 1 && background[i + 1]) || (i >= W && background[i - W]) || (i < W * (H - 1) && background[i + W]));
    rgba[i * 4] = rgb[i * 3];
    rgba[i * 4 + 1] = rgb[i * 3 + 1];
    rgba[i * 4 + 2] = rgb[i * 3 + 2];
    rgba[i * 4 + 3] = background[i] ? 0 : edge ? 200 : 255;
  }

  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${W}x${H}`, "-i", "-", "-c:v", "libwebp", "-quality", "88", `${OUT}/${name}.webp`], {
    input: rgba,
  });
  console.log(name, `bg rgb(${bg}) tolerance ${tolerance.toFixed(0)}`);
}

for (const file of readdirSync(IN)) if (/^[a-z]+\.png$/.test(file)) cutout(file.replace(".png", ""));
