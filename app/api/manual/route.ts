import { limited } from "../../../lib/limit";
import { readManual, type Mode, type Source } from "../../../lib/manual";

// A web search plus reading can take up to 3 minutes.
export const maxDuration = 300;

const IMAGE = /^data:image\/(jpeg|png|webp);base64,/;
// Vercel caps a request at 4.5 MB; 10 pages at 1200 px fit.
const MAX_PAGES = 10;

// shortcut: rate limit only, no auth; add auth before sharing the link publicly.
export async function POST(req: Request) {
  const blocked = limited(req);
  if (blocked) return blocked;
  const { url, query, images, mode: rawMode, lang } = await req.json().catch(() => ({}));
  const mode: Mode = rawMode === "fix" ? "fix" : "build";

  let source: Source;
  if (Array.isArray(images)) {
    const pages = images.filter((x): x is string => typeof x === "string" && IMAGE.test(x) && x.length <= 2_000_000);
    if (!pages.length || pages.length !== images.length || pages.length > MAX_PAGES) {
      return Response.json({ error: `Send 1 to ${MAX_PAGES} photos of the manual's pages.` }, { status: 400 });
    }
    source = { kind: "photos", images: pages };
  } else if (typeof url === "string") {
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
