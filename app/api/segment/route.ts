import { segment, segmentBox } from "../../../lib/sam";
import { locate } from "../../../lib/spark";

const IMAGE = /^data:image\/(jpeg|png|webp);base64,/;
const MAX_IMAGE_CHARS = 8_000_000;
const isSize = (n: unknown) => Number.isInteger(n) && (n as number) > 0 && (n as number) <= 4096;

// shortcut: no auth or rate limit, so anyone with the URL can spend API credit; add both before sharing the link publicly.
export async function POST(req: Request) {
  const { image, prompt, width, height } = await req.json().catch(() => ({}));

  if (typeof image !== "string" || !IMAGE.test(image) || image.length > MAX_IMAGE_CHARS) {
    return Response.json({ error: "Send a JPEG, PNG or WebP image under 6 MB." }, { status: 400 });
  }
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 80) {
    return Response.json({ error: "Name the part in 80 characters or less." }, { status: 400 });
  }

  const started = Date.now();
  try {
    let matches = await segment(image, prompt.trim());
    let via = "sam";
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
