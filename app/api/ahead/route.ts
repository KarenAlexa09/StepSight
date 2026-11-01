import { limited } from "../../../lib/limit";
import { furthestDone } from "../../../lib/spark";

const IMAGE = /^data:image\/(jpeg|png|webp);base64,/;
const isText = (v: unknown) => typeof v === "string" && v.trim().length > 0 && v.length <= 500;

// shortcut: rate limit only, no auth; add auth before sharing the link publicly.
export async function POST(req: Request) {
  const blocked = limited(req);
  if (blocked) return blocked;
  const { image, steps } = await req.json().catch(() => ({}));
  if (typeof image !== "string" || !IMAGE.test(image) || image.length > 8_000_000) {
    return Response.json({ error: "Send a JPEG, PNG or WebP image under 6 MB." }, { status: 400 });
  }
  if (!Array.isArray(steps) || !steps.length || steps.length > 6 || !steps.every((s) => isText(s?.instruction) && isText(s?.check))) {
    return Response.json({ error: "Send up to 6 steps to look for." }, { status: 400 });
  }
  try {
    return Response.json({ done: await furthestDone(image, steps) });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Timber couldn't check that. Try again." }, { status: 502 });
  }
}
