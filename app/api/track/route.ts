import { limited } from "../../../lib/limit";
import { lastBox, uploadVideo, type Box } from "../../../lib/sam";

export const maxDuration = 60;

const middle = (b: Box) => [(b.left + b.right) / 2, (b.top + b.bottom) / 2];
const inside = ([x, y]: number[], b: Box) => x > b.left && x < b.right && y > b.top && y < b.bottom;
// SAM on video misses "red 2x4 brick" but finds "red toy brick": second try drops sizes and says "toy" before the noun.
const toyish = (p: string) => {
  const words = p.replace(/\b\d+\s*[x×]\s*\d+\b/gi, "").split(/\s+/).filter(Boolean);
  return [...words.slice(0, -1), "toy", ...words.slice(-1)].join(" ");
};
const findLast = async (id: string, p: string) => (await lastBox(id, p)) ?? (await lastBox(id, toyish(p)));

// The clip of the person's hands placing a part (multipart, under Vercel's 4.5 MB body limit): did the part end up on its base?
// shortcut: rate limit only, no auth; add auth before sharing the link publicly.
export async function POST(req: Request) {
  const blocked = limited(req);
  if (blocked) return blocked;
  const form = await req.formData().catch(() => null);
  const video = form?.get("video");
  const part = String(form?.get("part") ?? "").trim();
  const base = String(form?.get("base") ?? "").trim();
  if (!(video instanceof Blob) || video.size > 4_000_000 || !/mp4|quicktime/.test(video.type)) {
    return Response.json({ error: "Send an MP4 clip under 4 MB." }, { status: 400 });
  }
  if (!part || !base || part.length > 80 || base.length > 80) return Response.json({ error: "Name the part and its base." }, { status: 400 });

  const started = Date.now();
  try {
    const id = await uploadVideo(video);
    const [partBox, baseBox] = await Promise.all([findLast(id, part), findLast(id, base)]);
    const placed = Boolean(partBox && baseBox && inside(middle(partBox), baseBox));
    return Response.json({ placed, part: partBox, base: baseBox, ms: Date.now() - started });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Couldn't watch the clip." }, { status: 502 });
  }
}
