import type { Lang } from "./manual";
import type { Box } from "./sam";

const MODEL = "muse-spark-1.3";

// "minimal" answers about 2x faster than "low" (2.3 s vs 4.4 s measured); keep "low" where judgment matters (photo checks).
type Effort = "minimal" | "low";

async function ask<T>(content: unknown[], name: string, schema: object, effort: Effort = "low"): Promise<T> {
  const res = await fetch("https://api.meta.ai/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      reasoning: { effort },
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

export type Turn = { role: "you" | "timber"; text: string };
export type Understood = {
  clear: boolean;
  ready: boolean;
  name: string;
  mode: "build" | "fix";
  issue: string;
  question: string;
  options: string[];
  model: string;
  needsModel: boolean;
  query: string;
};

export async function understand(said: string, image?: string, history: Turn[] = [], lang: Lang = "en"): Promise<Understood> {
  const talk = history.map((turn) => `${turn.role === "you" ? "Person" : "Timber"}: ${turn.text}`).join("\n");
  const data = await ask<Understood>(
    [
      {
        type: "input_text",
        text:
          "You are Timber, a friendly beaver who helps people build and fix things. Someone wants help with a physical task. " +
          "Use what they said, the conversation so far and the photo, if any. " +
          "clear: true only if you can tell which kind of product or object it is. " +
          "name: its most specific name from everything you know (brand and model if known, otherwise a plain description like 'bicycle chain'), max 8 words. " +
          "mode: 'fix' for anything repair, replacement of a part, maintenance, cleaning or troubleshooting (a broken thing, a dead bulb, a clogged drain), otherwise 'build' (assemble, install, set up or use something new). " +
          "issue: if mode is fix, the task or what is wrong in a few words; otherwise empty. " +
          "needsModel: true when the right steps depend on the exact model, which is true for almost every electronic or powered product and appliance (headphones, phone, coffee machine, vacuum, printer, router, camera, console) and for branded furniture; false for generic things (bicycle chain, dripping tap, light bulb, clogged drain). " +
          "model: the brand and model exactly as the person or the photo (label, logo, model number) gives them, or empty if unknown. A product line name that already implies the brand counts as a model: 'Kallax' is 'IKEA Kallax', 'AirPods Pro' is 'Apple AirPods Pro'; a size or variant the person adds (like '2x4') completes it.Set it to 'generic' only after the person explicitly chose a generic guide; saying they don't know the model is not enough, ask for a photo first. " +
          "ready: true only when (needsModel is false or model is not empty) AND you know what the person wants done with it. Never guess a brand or model. " +
          "If not ready, question is ONE short friendly question about the single most useful missing detail. Ask for brand and model first (a brand alone is not enough); only after that ask what exactly is wrong or what task they want. " +
          "If they don't know the model, ask them to send a photo of the label or model number, and offer a generic guide as an option. " +
          "options are up to 4 short likely answers (for a missing model offer likely brands, not tasks). When ready, question is empty and options is empty. " +
          "query: a web search query in English for the best guide, built from the whole conversation: brand, model, product and task, e.g. 'Sony WH-1000XM4 headphones clean ear pads'; add 'generic' if model is 'generic'; max 100 characters. " +
          `Write question and options in ${SPEAK[lang]}.` +
          (talk ? `\nConversation so far:\n${talk}` : "") +
          (said ? `\nThe person just said: "${said}"` : ""),
      },
      ...(image ? [{ type: "input_image", image_url: image }] : []),
    ],
    "understand",
    {
      type: "object",
      additionalProperties: false,
      required: ["clear", "ready", "name", "mode", "issue", "question", "options", "model", "needsModel", "query"],
      properties: {
        clear: { type: "boolean" },
        ready: { type: "boolean" },
        name: { type: "string" },
        mode: { type: "string", enum: ["build", "fix"] },
        issue: { type: "string" },
        question: { type: "string" },
        options: { type: "array", items: { type: "string" } },
        model: { type: "string" },
        needsModel: { type: "boolean" },
        query: { type: "string" },
      },
    },
    "minimal", // scripts/smoke/flow.mjs passes the same 10 conversations as with "low"
  );
  // The model sometimes says ready without a model; don't trust it for product-specific tasks.
  if (data.ready && data.needsModel && !data.model.trim()) data.ready = false;
  return data;
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
    "minimal",
  );
}

// The image model draws parts upside down (a bulb with its glass in the socket) unless told which way each thing points.
export async function describeStrip(title: string, instruction: string, target: string): Promise<string> {
  const { scene } = await ask<{ scene: string }>(
    [
      {
        type: "input_text",
        text:
          `A how-to drawing of 3 panels will show someone's hands doing this step${title ? ` on a ${title}` : ""}: "${instruction}"${target ? ` (key part: ${target})` : ""}. ` +
          "If the step has two actions, keep only the first, main one. In English, under 90 words, describe what panels 1 (just before), 2 (in the middle of the action) and 3 (done) show. " +
          "For every object say exactly which way it points and what touches what, as it really works (for example: the bulb's round glass on top, its metal screw base at the bottom going into the socket that points up).",
      },
    ],
    "scene",
    { type: "object", additionalProperties: false, required: ["scene"], properties: { scene: { type: "string" } } },
    "minimal",
  );
  return scene;
}
