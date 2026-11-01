import { limited } from "../../../lib/limit";
import { identify } from "../../../lib/spark";

export const maxDuration = 90;

const IMAGE = /^data:image\/(jpeg|png|webp);base64,/;

// shortcut: rate limit only, no auth; add auth before sharing the link publicly.
export async function POST(req: Request) {
  const blocked = limited(req);
  if (blocked) return blocked;
  const { image, lang } = await req.json().catch(() => ({}));
  if (typeof image !== "string" || !IMAGE.test(image) || image.length > 8_000_000) {
    return Response.json({ error: "Send a JPEG, PNG or WebP image under 6 MB." }, { status: 400 });
  }
  try {
    return Response.json(await identify(image, lang === "es" ? "es" : "en"));
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Couldn't identify it. Try again." }, { status: 502 });
  }
}
