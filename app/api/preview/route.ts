import { limited } from "../../../lib/limit";

const IMAGE = /^data:image\/(jpeg|png|webp);base64,/;

// Muse Image edits the person's own parts photo into the finished build, so the preview starts from what is really on the table.
// shortcut: rate limit only, no auth; add auth before sharing the link publicly.
export async function POST(req: Request) {
  const blocked = limited(req);
  if (blocked) return blocked;
  const { image, title } = await req.json().catch(() => ({}));
  if (typeof image !== "string" || !IMAGE.test(image) || image.length > 4_000_000) {
    return Response.json({ error: "Send a JPEG, PNG or WebP image under 3 MB." }, { status: 400 });
  }
  const name = typeof title === "string" ? title.trim().slice(0, 600) : "";

  try {
    const form = new FormData();
    form.append("model", "muse-image-1.0");
    form.append(
      "prompt",
      `The same photo, same table, light and camera angle, but now the parts are fully assembled into the finished ${name || "build"}. ` +
        "Use only the parts visible in this photo, with their exact colors and sizes; add nothing new.",
    );
    form.append("size", "1024x1024");
    form.append("output_format", "jpeg");
    form.append("image", new Blob([Buffer.from(image.split(",")[1], "base64")], { type: "image/jpeg" }), "parts.jpg");
    const res = await fetch("https://api.meta.ai/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY}` },
      body: form,
    });
    const data = await res.json();
    if (!res.ok || !data.data?.[0]?.b64_json) throw new Error(`Image ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
    return Response.json({ image: `data:image/jpeg;base64,${data.data[0].b64_json}` });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Couldn't draw the preview." }, { status: 502 });
  }
}
