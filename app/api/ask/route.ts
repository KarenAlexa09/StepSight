import { limited } from "../../../lib/limit";
import { interpret } from "../../../lib/spark";

const isText = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.length <= max;

// shortcut: rate limit only, no auth; add auth before sharing the link publicly.
export async function POST(req: Request) {
  const blocked = limited(req);
  if (blocked) return blocked;
  const { said, step, lang } = await req.json().catch(() => ({}));
  if (!isText(said, 300)) return Response.json({ error: "Say or type something for Timber." }, { status: 400 });

  const context =
    step && isText(step.instruction, 500) && Array.isArray(step.parts)
      ? { instruction: step.instruction, parts: step.parts.filter((p: unknown) => isText(p, 100)).slice(0, 20) }
      : undefined;

  try {
    return Response.json(await interpret(said.trim(), context, lang === "es" ? "es" : "en"));
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Timber didn't get that. Try again." }, { status: 502 });
  }
}
