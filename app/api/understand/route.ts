import { limited } from "../../../lib/limit";
import { understand, type Turn } from "../../../lib/spark";

const IMAGE = /^data:image\/(jpeg|png|webp);base64,/;

// shortcut: rate limit only, no auth; add auth before sharing the link publicly.
export async function POST(req: Request) {
  const blocked = limited(req);
  if (blocked) return blocked;
  const { text, image, label, history, lang } = await req.json().catch(() => ({}));
  const said = typeof text === "string" ? text.trim() : "";
  const valid = (x: unknown) => (typeof x === "string" && IMAGE.test(x) && x.length <= 8_000_000 ? x : undefined);
  const photo = valid(image);
  if ((!said && !photo) || said.length > 300) {
    return Response.json({ error: "Say something, type it, or send a photo." }, { status: 400 });
  }

  try {
    const turns: Turn[] = (Array.isArray(history) ? history : [])
      .filter((t) => (t?.role === "you" || t?.role === "timber") && typeof t.text === "string" && t.text.length <= 300)
      .slice(-12);
    const data = await understand(said, photo, turns, lang === "es" ? "es" : "en", valid(label));
    return Response.json({ ...data, options: data.options.slice(0, 4) });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Couldn't understand that. Try again." }, { status: 502 });
  }
}
