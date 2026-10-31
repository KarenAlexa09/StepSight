import { limited } from "../../../lib/limit";

// One image with 3 panels (≈15 s) instead of 3 images: the panels share the scene, so they read as one motion.
function stripPrompt(title: string, instruction: string, target: string) {
  return (
    `A comic strip of 3 equal square panels side by side, left to right, showing a person's hands doing this step${title ? ` on a ${title}` : ""}: "${instruction}". ` +
    `${target ? `The key part is the ${target}. ` : ""}` +
    "Panel 1: just before. Panel 2: the hands in the middle of the action. Panel 3: the step finished. " +
    "Minimal instructional line illustration, thin black lines on a pure white background, flat, no shading, " +
    "the same camera angle and the same objects in all three panels, no text, no numbers, no labels."
  );
}

// shortcut: rate limit only, no auth; add auth before sharing the link publicly.
export async function POST(req: Request) {
  const blocked = limited(req);
  if (blocked) return blocked;
  const { title, instruction, target } = await req.json().catch(() => ({}));
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  if (!text(instruction, 300)) return Response.json({ error: "Send the step." }, { status: 400 });

  try {
    const res = await fetch("https://api.meta.ai/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "muse-image-1.0",
        prompt: stripPrompt(text(title, 120), text(instruction, 300), text(target, 80)),
        size: "1536x512",
        output_format: "jpeg",
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.data?.[0]?.b64_json) throw new Error(`Image ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
    return Response.json({ image: `data:image/jpeg;base64,${data.data[0].b64_json}` });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Couldn't draw this step." }, { status: 502 });
  }
}
