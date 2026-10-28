import { speak } from "../../../lib/voice";

// shortcut: no auth or rate limit, same as /api/segment; add both before sharing the link publicly.
export async function POST(req: Request) {
  const { text } = await req.json().catch(() => ({}));
  if (typeof text !== "string" || !text.trim() || text.length > 400) {
    return Response.json({ error: "Send up to 400 characters." }, { status: 400 });
  }

  try {
    const audio = await speak(text.trim());
    return new Response(audio.body, { headers: { "Content-Type": "audio/mpeg" } });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Timber lost his voice. Try again." }, { status: 502 });
  }
}
