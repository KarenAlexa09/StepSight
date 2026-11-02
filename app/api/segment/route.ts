import { limited } from "../../../lib/limit";
import { segment, segmentBox } from "../../../lib/sam";
import { locate, locateParts, pickMarked, type Piece } from "../../../lib/spark";

const IMAGE = /^data:image\/(jpeg|png|webp);base64,/;
const MAX_IMAGE_CHARS = 8_000_000;
const isSize = (n: unknown) => Number.isInteger(n) && (n as number) > 0 && (n as number) <= 4096;
const text = (v: unknown, max: number) => typeof v === "string" && v.length <= max;
const isPiece = (p: Piece) => p && text(p.name, 60) && text(p.color, 30) && Number.isInteger(p.quantity) && p.quantity > 0 && p.quantity <= 10 && (p.looks === undefined || text(p.looks, 160));

// shortcut: rate limit only, no auth; add auth before sharing the link publicly.
export async function POST(req: Request) {
  const blocked = limited(req);
  if (blocked) return blocked;
  const { image, prompt, parts, marked, count, width, height } = await req.json().catch(() => ({}));

  if (typeof image !== "string" || !IMAGE.test(image) || image.length > MAX_IMAGE_CHARS) {
    return Response.json({ error: "Send a JPEG, PNG or WebP image under 6 MB." }, { status: 400 });
  }

  // Set-of-Mark: the phone numbered every piece SAM found; Spark picks the step's pieces by number.
  if (typeof marked === "string") {
    if (!IMAGE.test(marked) || marked.length > MAX_IMAGE_CHARS || !Number.isInteger(count) || count < 1 || count > 200 || !Array.isArray(parts) || !parts.length || parts.length > 8 || !parts.every(isPiece)) {
      return Response.json({ error: "Send the numbered photo, how many pieces it shows and up to 8 parts." }, { status: 400 });
    }
    const started = Date.now();
    try {
      return Response.json({ picks: await pickMarked(image, marked, count, parts), ms: Date.now() - started });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Couldn't find the pieces. Try again." }, { status: 502 });
    }
  }

  // Every piece of a step at once: Spark boxes each one, SAM cuts each out.
  if (Array.isArray(parts)) {
    if (!parts.length || parts.length > 8 || !parts.every(isPiece) || !isSize(width) || !isSize(height)) {
      return Response.json({ error: "Send up to 8 parts and the image size." }, { status: 400 });
    }
    const started = Date.now();
    try {
      const size = { width, height };
      const found = await locateParts(image, size, parts);
      const matches = await Promise.all(found.map(async ({ part, box }) => ({ ...(await segmentBox(image, size, box))[0], part })));
      return Response.json({ matches, via: "spark+sam", ms: Date.now() - started });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Couldn't find the pieces. Try again." }, { status: 502 });
    }
  }
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 80) {
    return Response.json({ error: "Name the part in 80 characters or less." }, { status: 400 });
  }

  const started = Date.now();
  try {
    let matches = await segment(image, prompt.trim());
    let via = "sam";
    // SAM finds "blue brick" but not "blue 2x2 brick": retry without sizes before asking Spark.
    const plain = prompt.replace(/\b\d+\s*[x×]\s*\d+\b/gi, "").replace(/\s+/g, " ").trim();
    if (matches.length === 0 && plain && plain !== prompt.trim()) matches = await segment(image, plain);
    // SAM misses small things in busy scenes; Muse Spark finds the area, then SAM cuts it out.
    if (matches.length === 0 && isSize(width) && isSize(height)) {
      const box = await locate(image, { width, height }, prompt.trim());
      if (box) {
        matches = await segmentBox(image, { width, height }, box);
        via = "spark+sam";
      }
    }
    return Response.json({ matches, via, ms: Date.now() - started });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Couldn't reach SAM. Try again." }, { status: 502 });
  }
}
