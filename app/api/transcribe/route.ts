import { limited } from "../../../lib/limit";
import { transcribe } from "../../../lib/voice";

const MAX_BYTES = 2_000_000;

// shortcut: rate limit only, no auth; add auth before sharing the link publicly.
export async function POST(req: Request) {
  const blocked = limited(req);
  if (blocked) return blocked;
  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.type !== "audio/wav" || audio.size === 0 || audio.size > MAX_BYTES) {
    return Response.json({ error: "Send a short WAV recording." }, { status: 400 });
  }

  try {
    return Response.json({ transcript: await transcribe(audio) });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Couldn't hear that. Try again." }, { status: 502 });
  }
}
