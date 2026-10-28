import type { Box } from "./sam";

const MODEL = "muse-spark-1.3";

async function ask<T>(content: unknown[], name: string, schema: object): Promise<T> {
  const res = await fetch("https://api.meta.ai/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      reasoning: { effort: "low" },
      input: [{ type: "message", role: "user", content }],
      text: { format: { type: "json_schema", name, schema, strict: true } },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Spark ${res.status}: ${JSON.stringify(data)}`);
  const text = (data.output ?? [])
    .flatMap((item: { content?: { type: string; text: string }[] }) => item.content ?? [])
    .filter((c: { type: string }) => c.type === "output_text")
    .map((c: { text: string }) => c.text)
    .join("");
  return JSON.parse(text);
}

export async function locate(
  image: string,
  size: { width: number; height: number },
  target: string,
): Promise<Box | null> {
  const { found, box } = await ask<{ found: boolean; box: number[] }>(
    [
      {
        type: "input_text",
        text: `The image is ${size.width}x${size.height} pixels. Find the ${target}. If it's there, return box as [x1, y1, x2, y2] in pixels around the best match.`,
      },
      { type: "input_image", image_url: image },
    ],
    "locate",
    {
      type: "object",
      additionalProperties: false,
      required: ["found", "box"],
      properties: { found: { type: "boolean" }, box: { type: "array", items: { type: "integer" } } },
    },
  );
  if (!found || box.length !== 4) return null;
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
  const result = {
    left: clamp(box[0], size.width),
    top: clamp(box[1], size.height),
    right: clamp(box[2], size.width),
    bottom: clamp(box[3], size.height),
  };
  return result.right - result.left > 2 && result.bottom - result.top > 2 ? result : null;
}

export async function identify(image: string): Promise<{ name: string; issue: string }> {
  return ask<{ name: string; issue: string }>(
    [
      {
        type: "input_text",
        text:
          "What product or object is in this photo? name: its most specific name as you can tell (brand and model if visible, " +
          "otherwise a plain description like 'bicycle chain'), max 8 words. issue: if it looks broken, loose or open for repair, " +
          "say what in a few words; otherwise empty.",
      },
      { type: "input_image", image_url: image },
    ],
    "identify",
    {
      type: "object",
      additionalProperties: false,
      required: ["name", "issue"],
      properties: { name: { type: "string" }, issue: { type: "string" } },
    },
  );
}

export type Check = { done: boolean; problem: string; fix: string; reply: string };

export async function checkStep(
  image: string,
  step: { instruction: string; check: string; parts: string[] },
): Promise<Check> {
  return ask<Check>(
    [
      {
        type: "input_text",
        text:
          `This is a photo of someone's build. The step was: "${step.instruction}" using ${step.parts.join(", ") || "no new parts"}. ` +
          `When the step is done this should be visibly true: "${step.check}". ` +
          "Is the step done? Be fair: if it's plausibly right from this angle, say done. " +
          "If not, problem and fix are each one short, friendly sentence naming parts by color and size; otherwise both are empty. " +
          "reply is what Timber the beaver says out loud: short, upbeat, English, no emoji.",
      },
      { type: "input_image", image_url: image },
    ],
    "step_check",
    {
      type: "object",
      additionalProperties: false,
      required: ["done", "problem", "fix", "reply"],
      properties: {
        done: { type: "boolean" },
        problem: { type: "string" },
        fix: { type: "string" },
        reply: { type: "string" },
      },
    },
  );
}

export type Intent ={ action: "next" | "back" | "find" | "repeat" | "none"; target: string; reply: string };

export async function interpret(said: string, step?: { instruction: string; parts: string[] }): Promise<Intent> {
  const context = step
    ? `They are on this step: "${step.instruction}". Parts for this step: ${step.parts.join(", ") || "none"}.`
    : "They have no manual loaded; they're just looking for things with the camera.";
  return ask<Intent>(
    [
      {
        type: "input_text",
        text:
          "You are Timber, a friendly beaver who helps people build and fix things through their phone camera. " +
          `${context} The user said: "${said}". ` +
          "Pick one action: next (go to the next step), back (previous step), find (show where something is with the camera), " +
          "repeat (read the step again) or none (just answer). " +
          'For find, target is a short noun phrase to look for, color first if known, e.g. "red piece" or "vacuum cleaner"; otherwise "". ' +
          "reply is one short, upbeat spoken sentence in English, no emoji.",
      },
    ],
    "intent",
    {
      type: "object",
      additionalProperties: false,
      required: ["action", "target", "reply"],
      properties: {
        action: { type: "string", enum: ["next", "back", "find", "repeat", "none"] },
        target: { type: "string" },
        reply: { type: "string" },
      },
    },
  );
}
