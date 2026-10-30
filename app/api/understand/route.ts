import { limited } from "../../../lib/limit";
import { understand } from "../../../lib/spark";

const IMAGE = /^data:image\/(jpeg|png|webp);base64,/;

// shortcut: rate limit only, no auth; add auth before sharing the link publicly.
export async function POST(req: Request) {
  const blocked = limited(req);
  if (blocked) return blocked;
  const { text, image } = await req.json().catch(() => ({}));
  const said = typeof text === "string" ? text.trim() : "";
  const photo = typeof image === "string" && IMAGE.test(image) && image.length <= 8_000_000 ? image : undefined;
  if ((!said && !photo) || said.length > 300) {
    return Response.json({ error: "Say something, type it, or send a photo." }, { status: 400 });
  }

  try {
    return Response.json(await understand(said, photo));
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Couldn't understand that. Try again." }, { status: 502 });
  }
}
