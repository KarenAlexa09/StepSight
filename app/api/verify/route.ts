import { limited } from "../../../lib/limit";
import { checkStep } from "../../../lib/spark";

const IMAGE = /^data:image\/(jpeg|png|webp);base64,/;
const isText = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.length <= max;

// shortcut: rate limit only, no auth; add auth before sharing the link publicly.
export async function POST(req: Request) {
  const blocked = limited(req);
  if (blocked) return blocked;
  const { image, step } = await req.json().catch(() => ({}));
  if (typeof image !== "string" || !IMAGE.test(image) || image.length > 8_000_000) {
    return Response.json({ error: "Send a JPEG, PNG or WebP image under 6 MB." }, { status: 400 });
  }
  if (!step || !isText(step.instruction, 500) || !isText(step.check, 500) || !Array.isArray(step.parts)) {
    return Response.json({ error: "Missing the step to check." }, { status: 400 });
  }

  try {
    const parts = step.parts.filter((p: unknown) => isText(p, 100)).slice(0, 20);
    return Response.json(await checkStep(image, { instruction: step.instruction, check: step.check, parts }));
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Timber couldn't check that. Try again." }, { status: 502 });
  }
}
