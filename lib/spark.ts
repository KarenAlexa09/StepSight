import type { Lang } from "./manual";
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

export type Understood = { clear: boolean; name: string; mode: "build" | "fix"; issue: string };

export async function understand(said: string, image?: string): Promise<Understood> {
  return ask<Understood>(
    [
      {
        type: "input_text",
        text:
          "Someone wants help with a physical task. From what they said and the photo, if any: " +
          "clear: true only if you can tell which product or object it is. " +
          "name: its most specific name as you can tell (brand and model if visible, otherwise a plain description like 'bicycle chain'), max 8 words. " +
          "mode: 'fix' if it is broken, loose or open for repair, otherwise 'build' (assemble, set up or use it). " +
          "issue: if mode is fix, what is wrong in a few words; otherwise empty." +
          (said ? ` They said: "${said}"` : ""),
      },
      ...(image ? [{ type: "input_image", image_url: image }] : []),
    ],
    "understand",
    {
      type: "object",
      additionalProperties: false,
      required: ["clear", "name", "mode", "issue"],
      properties: {
        clear: { type: "boolean" },
        name: { type: "string" },
        mode: { type: "string", enum: ["build", "fix"] },
        issue: { type: "string" },
      },
    },
  );
}

export type Check = { done: boolean; problem: string; fix: string; reply: string; seen: string; confidence: "high" | "medium" | "low" };

const SPEAK: Record<Lang, string> = { en: "English", es: "Spanish" };

export async function checkStep(
  image: string,
  step: { instruction: string; check: string; parts: string[] },
  lang: Lang = "en",
): Promise<Check> {
  const result = await ask<Check>(
    [
      {
        type: "input_text",
        text:
          `This is a photo of someone's build. The step was: "${step.instruction}" using ${step.parts.join(", ") || "no new parts"}. ` +
          `When the step is done this should be visibly true: "${step.check}". ` +
          "Is the step done? Judge only what you can actually see. Say done only if the photo clearly shows it. " +
          "If the part is hidden, blurry or cut off, say not done and ask for another angle. " +
          "seen: one short sentence of what you can see that decides it. confidence: high, medium or low. " +
          "If not done, problem and fix are each one short, friendly sentence naming parts by color and size; otherwise both are empty. " +
          `Write seen, problem, fix and reply in ${SPEAK[lang]}. ` +
          "reply is what Timber the beaver says out loud: short, upbeat, no emoji.",
      },
      { type: "input_image", image_url: image },
    ],
    "step_check",
    {
      type: "object",
      additionalProperties: false,
      required: ["done", "problem", "fix", "reply", "seen", "confidence"],
      properties: {
        done: { type: "boolean" },
        problem: { type: "string" },
        fix: { type: "string" },
        reply: { type: "string" },
        seen: { type: "string" },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
      },
    },
  );
  // A guess is not a pass: low confidence means show it again.
  if (result.done && result.confidence === "low") {
    return {
      ...result,
      done: false,
      problem: result.problem || "I can't be sure from this photo.",
      fix: result.fix || "Show it again, closer or from another angle.",
    };
  }
  return result;
}

export type Intent ={ action: "next" | "back" | "find" | "repeat" | "none"; target: string; reply: string };

export async function interpret(said: string, step?: { instruction: string; parts: string[] }, lang: Lang = "en"): Promise<Intent> {
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
          `reply is one short, upbeat spoken sentence in ${SPEAK[lang]}, no emoji.`,
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
