import { segment } from "../../../lib/sam";

const IMAGE = /^data:image\/(jpeg|png|webp);base64,/;
const MAX_IMAGE_CHARS = 8_000_000;

// shortcut: no auth or rate limit, so anyone with the URL can spend API credit; add both before sharing the link publicly.
export async function POST(req: Request) {
  const { image, prompt } = await req.json().catch(() => ({}));

  if (typeof image !== "string" || !IMAGE.test(image) || image.length > MAX_IMAGE_CHARS) {
    return Response.json({ error: "Send a JPEG, PNG or WebP image under 6 MB." }, { status: 400 });
  }
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 80) {
    return Response.json({ error: "Name the part in 80 characters or less." }, { status: 400 });
  }

  const started = Date.now();
  try {
    const matches = await segment(image, prompt.trim());
    return Response.json({ matches, ms: Date.now() - started });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Couldn't reach SAM. Try again." }, { status: 502 });
  }
}
