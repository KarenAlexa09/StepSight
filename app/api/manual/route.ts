import { limited } from "../../../lib/limit";
import { readManual, type Mode, type Source } from "../../../lib/manual";

// A web search plus reading can take up to 3 minutes.
export const maxDuration = 300;

// shortcut: rate limit only, no auth; add auth before sharing the link publicly.
export async function POST(req: Request) {
  const blocked = limited(req);
  if (blocked) return blocked;
  const { url, query, mode: rawMode, lang } = await req.json().catch(() => ({}));
  const mode: Mode = rawMode === "fix" ? "fix" : "build";

  let source: Source;
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
  } else {
    return Response.json({ error: "Send a product name or a PDF link." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: unknown) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        await readManual(source, lang === "es" ? "es" : "en", emit);
      } catch (error) {
        console.error(error);
        emit({ type: "failed" });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
