import { checkReading, startReading } from "../../../lib/manual";

// shortcut: no auth or rate limit, same as /api/segment; add both before sharing the link publicly.
export async function POST(req: Request) {
  const { url } = await req.json().catch(() => ({}));
  let parsed: URL | null = null;
  try {
    parsed = typeof url === "string" && url.length <= 500 ? new URL(url) : null;
  } catch {}
  if (!parsed || parsed.protocol !== "https:") {
    return Response.json({ error: "Paste a link to the manual's PDF (https://…)." }, { status: 400 });
  }

  try {
    return Response.json({ id: await startReading(parsed.href) });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Couldn't start reading the manual. Try again." }, { status: 502 });
  }
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^resp_[A-Za-z0-9]+$/.test(id)) return Response.json({ error: "Unknown reading." }, { status: 400 });

  try {
    return Response.json(await checkReading(id));
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Couldn't check the manual. Try again." }, { status: 502 });
  }
}
