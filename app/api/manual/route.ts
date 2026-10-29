import { limited } from "../../../lib/limit";
import { checkReading, startReading, type Mode, type Source } from "../../../lib/manual";
import { identify } from "../../../lib/spark";

const IMAGE = /^data:image\/(jpeg|png|webp);base64,/;

// shortcut: rate limit only, no auth; add auth before sharing the link publicly.
export async function POST(req: Request) {
  const blocked = limited(req);
  if (blocked) return blocked;
  const { url, query, image, mode: rawMode } = await req.json().catch(() => ({}));
  const mode: Mode = rawMode === "fix" ? "fix" : "build";

  try {
    let source: Source;
    let identified: string | undefined;

    if (typeof url === "string") {
      let parsed: URL | null = null;
      try {
        parsed = url.length <= 500 ? new URL(url) : null;
      } catch {}
      if (!parsed || parsed.protocol !== "https:") {
        return Response.json({ error: "Paste a link to the manual's PDF (https://…)." }, { status: 400 });
      }
      source = { kind: "pdf", url: parsed.href };
    } else if (typeof query === "string" && query.trim() && query.length <= 120) {
      source = { kind: "search", query: query.trim(), mode };
    } else if (typeof image === "string" && IMAGE.test(image) && image.length <= 8_000_000) {
      const { name, issue } = await identify(image);
      identified = name;
      source = { kind: "search", query: mode === "fix" && issue ? `${name}: ${issue}` : name, mode };
    } else {
      return Response.json({ error: "Send a photo, a product name or a PDF link." }, { status: 400 });
    }

    return Response.json({ id: await startReading(source), identified, mode });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Couldn't start. Try again." }, { status: 502 });
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
