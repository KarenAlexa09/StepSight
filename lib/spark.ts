import type { Lang } from "./manual";
import type { Box } from "./sam";

const MODEL = "muse-spark-1.3";

// "minimal" answers about 2x faster than "low" (2.3 s vs 4.4 s measured); keep "low" where judgment matters (photo checks).
type Effort = "minimal" | "low" | "medium";

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

// Pixel boxes came back squashed upward on tall phone frames (9:16); a 0–1000 scale per axis doesn't.
const SCALE = "Give every coordinate on a 0 to 1000 scale: x as a fraction of the image width, y as a fraction of the image height (0 is the top-left corner, 1000 the right or bottom edge).";

function toPixels(b: number[], size: { width: number; height: number }): Box {
  const at = (v: number, max: number) => Math.round((Math.max(0, Math.min(1000, v)) / 1000) * max);
  return { left: at(b[0], size.width), top: at(b[1], size.height), right: at(b[2], size.width), bottom: at(b[3], size.height) };
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
        text:
          `Find the ${target}. ` +
          "found is true only if you can clearly see that exact part; if it is hidden, cut off, too blurry or you would be guessing, found is false. " +
          `If found, return box as [x1, y1, x2, y2] tight around it. ${SCALE}`,
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
  const result = toPixels(box, size);
  return result.right - result.left > 2 && result.bottom - result.top > 2 ? result : null;
}

export type Piece = { name: string; color: string; quantity: number; looks?: string };

// Show me for a whole step: one box per piece the step needs (SAM alone misses most pieces in a loose pile).
export async function locateParts(image: string, size: { width: number; height: number }, parts: Piece[]): Promise<{ part: number; box: Box }[]> {
  const list = parts.map((p, i) => `${i + 1}. ${p.quantity}x ${p.color} ${p.name}${p.looks ? ` (${p.looks})` : ""}`).join("\n");
  const { pieces } = await ask<{ pieces: { part: number; boxes: number[][] }[] }>(
    [
      {
        type: "input_text",
        text:
          `The image shows loose toy building pieces. Find the pieces for this building step:\n${list}\n` +
          `For each numbered piece, return a tight box [x1, y1, x2, y2] around each separate matching piece you can clearly see, up to its quantity. ${SCALE} ` +
          "Check color, shape and size carefully; never box the same piece twice, never box a piece that is a different kind, and leave a piece out rather than guess.",
      },
      { type: "input_image", image_url: image },
    ],
    "pieces",
    {
      type: "object",
      additionalProperties: false,
      required: ["pieces"],
      properties: {
        pieces: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["part", "boxes"],
            properties: { part: { type: "integer" }, boxes: { type: "array", items: { type: "array", items: { type: "integer" } } } },
          },
        },
      },
    },
    "minimal",
  );
  return pieces.flatMap(({ part, boxes }) =>
    boxes
      .filter((b) => b.length === 4 && part >= 1 && part <= parts.length)
      .slice(0, parts[part - 1]?.quantity ?? 0)
      .map((b) => ({ part: part - 1, box: toPixels(b, size) }))
      .filter(({ box }) => box.right - box.left > 2 && box.bottom - box.top > 2),
  );
}

// Set-of-Mark: SAM found every piece and each one carries a number label; Spark only picks numbers, which it does far better than placing boxes.
// build: the label of what is already built (0 if nothing), so the camera can point each piece to it.
export async function pickMarked(image: string, marked: string, count: number, parts: Piece[]): Promise<{ picks: { part: number; label: number }[]; build: number }> {
  const list = parts.map((p, i) => `${i + 1}. ${p.quantity}x ${p.color} ${p.name}${p.looks ? ` (${p.looks})` : ""}`).join("\n");
  const { picks, build } = await ask<{ picks: { part: number; labels: number[] }[]; build: number }>(
    [
      {
        type: "input_text",
        text:
          `Two photos of the same loose toy building pieces: the first is plain, the second has a white numbered label (1 to ${count}) on every piece. Pick the pieces for this building step:\n${list}\n` +
          "For each numbered part, give the label numbers of matching pieces, up to its quantity. Look at the plain photo to judge color, shape and size; use the labels only to name the piece. " +
          "Never pick the same label twice, and leave a part out rather than guess. " +
          "build: the label of the model already put together in earlier steps (several pieces joined into one), which these pieces attach to; 0 if nothing is built yet. Never pick the build as a part.",
      },
      { type: "input_image", image_url: image },
      { type: "input_image", image_url: marked },
    ],
    "picks",
    {
      type: "object",
      additionalProperties: false,
      required: ["picks", "build"],
      properties: {
        build: { type: "integer" },
        picks: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["part", "labels"],
            properties: { part: { type: "integer" }, labels: { type: "array", items: { type: "integer" } } },
          },
        },
      },
    },
    "minimal",
  );
  const whole = build >= 1 && build <= count ? build : 0;
  const used = new Set<number>([whole]);
  const chosen = picks.flatMap(({ part, labels }) =>
    part >= 1 && part <= parts.length
      ? [...new Set(labels)]
          .filter((l) => l >= 1 && l <= count && !used.has(l))
          .slice(0, parts[part - 1].quantity)
          .map((label) => (used.add(label), { part: part - 1, label }))
      : [],
  );
  return { picks: chosen, build: whole };
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
  danger: boolean;
  safety: string;
  pro: string;
};

export async function understand(said: string, image?: string, history: Turn[] = [], lang: Lang = "en", label?: string): Promise<Understood> {
  const talk = history.map((turn) => `${turn.role === "you" ? "Person" : "Timber"}: ${turn.text}`).join("\n");
  const data = await ask<Understood>(
    [
      {
        type: "input_text",
        text:
          "You are Timber, a friendly beaver who helps people build and fix things. Someone wants help with a physical task. " +
          "Use what they said, the conversation so far and the photo, if any. " +
          "clear: true only if you can tell which kind of product or object it is, and the task is building, setting up, fixing or caring for a physical object. " +
          "Cooking and recipes, health, people, pets and software-only problems are not Timber's job: clear false, and question gently says what Timber can help with. " +
          "A bare 4 to 6 digit number is usually a LEGO set number: use it as the model if you recognize the set. " +
          "When the person changes their mind, the latest message wins (for example 'actually it's already built, a drawer came off' turns a build into a fix). " +
          "danger: true only when doing it yourself is genuinely dangerous for a beginner or legally needs a professional: gas leaks or opening gas appliances, the electrical panel, breakers or mains wiring, car brakes, airbags or steering, " +
          "the inside of microwaves, TVs or other high-voltage parts, roofs or heights, structural walls. Not for ordinary tasks done with care (changing a bulb with the lamp unplugged, cleaning, assembling furniture, a bike). " +
          `If danger is true, ready is false, question and options are empty, and safety is one or two short, calm sentences in ${SPEAK[lang]} saying what to do right now and who to call; otherwise safety is empty. ` +
          `pro: if danger, the kind of professional to look for, 1 to 3 words in ${SPEAK[lang]} (gas company, electrician, car mechanic, appliance repair); otherwise empty. ` +
          "name: its most specific name from everything you know (brand and model if known, otherwise a plain description like 'bicycle chain'), max 8 words. " +
          "mode: 'fix' for anything repair, replacement of a part, maintenance, cleaning or troubleshooting (a broken thing, a dead bulb, a clogged drain), otherwise 'build' (assemble, install, set up or use something new). Cleaning or dusting is always 'fix', even for a LEGO set or furniture. Putting a fallen piece back on, or rebuilding part of, something that has building instructions (a LEGO set, flat-pack furniture) is 'build', because the building instructions show where it goes. " +
          "issue: if mode is fix, the task or what is wrong in a few words; otherwise empty. " +
          "needsModel: true when the right steps depend on the exact model, which is true for almost every electronic or powered product and appliance (headphones, phone, coffee machine, vacuum, printer, router, camera, console) and for branded furniture; false for generic things (bicycle chain, dripping tap, light bulb, clogged drain). " +
          "model: the brand and model exactly as the person or the photo (label, logo, model number) gives them, or empty if unknown. A product line name that already implies the brand counts as a model: 'Kallax' is 'IKEA Kallax', 'AirPods Pro' is 'Apple AirPods Pro'; a size or variant the person adds (like '2x4') completes it.Set it to 'generic' only after the person explicitly chose a generic guide; saying they don't know the model is not enough, ask for a photo first. " +
          "ready: true only when (needsModel is false or model is not empty) AND you know what the person wants done with it. Never guess a brand or model; you may name one from the photo only when the product is clearly recognizable (a distinctive design or a visible logo). If the product is a set or kit with several separate builds (for example a LEGO set with two plants, or a 3-in-1 set), and the person wants to build it, the model must also say which build; if a photo shows only one of them, that is the one; otherwise ready is false until you know which. For cleaning or other care, don't ask which build. " +
          "When the problem is already clear (won't turn on, won't print, won't pair, blinking orange), don't ask what's wrong. " +
          "If not ready, question is ONE short friendly question about the single most useful missing detail. Ask for brand and model first (a brand alone is not enough), then which build if it is a set with several; only after that ask what exactly is wrong or what task they want. " +
          "If they don't know the model, ask them to send a photo of the label or model number, and offer a generic guide as an option. " +
          "options are up to 4 short likely answers (for a missing model offer likely brands, not tasks). When ready, question is empty and options is empty. " +
          "query: a web search query in English for the best guide, built from the whole conversation: brand, model, product and task, e.g. 'Sony WH-1000XM4 headphones clean ear pads'; add 'generic' if model is 'generic'; max 100 characters. " +
          `Write name, question and options in ${SPEAK[lang]}; keep brand and model names exactly as they are; query stays in English.` +
          (label ? "\nThere are two photos: the first shows the object, the second one they sent later (often its label or back). Use both." : "") +
          (talk ? `\nConversation so far:\n${talk}` : "") +
          (said ? `\nThe person just said: "${said}"` : ""),
      },
      ...[image, label].filter(Boolean).map((url) => ({ type: "input_image", image_url: url })),
    ],
    "understand",
    {
      type: "object",
      additionalProperties: false,
      required: ["clear", "ready", "name", "mode", "issue", "question", "options", "model", "needsModel", "query", "danger", "safety", "pro"],
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
        danger: { type: "boolean" },
        safety: { type: "string" },
        pro: { type: "string" },
        query: { type: "string" },
      },
    },
    "minimal", // scripts/lab/run.mjs: 104/105 conversations pass with "minimal"
  );
  // The model sometimes says ready without a model; don't trust it for product-specific tasks.
  if (data.ready && data.needsModel && !data.model.trim()) data.ready = false;
  if (data.danger) data.ready = false;
  return data;
}

export type Check = { done: boolean; problem: string; fix: string; reply: string; seen: string; confidence: "high" | "medium" | "low"; wrong: number[] };

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
          `This is a photo of someone's build. The step was: "${step.instruction}" using ${step.parts.map((p, i) => `${i + 1}) ${p}`).join(", ") || "no new parts"}. ` +
          `When the step is done this should be visibly true: "${step.check}". ` +
          "Is the step done? Judge only what you can actually see. Say done only if the photo clearly shows it. " +
          "If the part is hidden, blurry or cut off, say not done and ask for another angle. " +
          "seen: one short sentence of what you can see that decides it. confidence: high, medium or low. " +
          "If not done, problem and fix are each one short, friendly sentence naming parts by color and size; otherwise both are empty. " +
          "wrong: the numbers of the listed parts that are missing, still loose or in the wrong place; empty if done. " +
          `Write seen, problem, fix and reply in ${SPEAK[lang]}. ` +
          "reply is what Timber the beaver says out loud: short, upbeat, no emoji.",
      },
      { type: "input_image", image_url: image },
    ],
    "step_check",
    {
      type: "object",
      additionalProperties: false,
      required: ["done", "problem", "fix", "reply", "seen", "confidence", "wrong"],
      properties: {
        done: { type: "boolean" },
        wrong: { type: "array", items: { type: "integer" } },
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

export async function interpret(said: string, step?: { instruction: string; parts: string[]; number?: number; total?: number }, lang: Lang = "en"): Promise<Intent> {
  const context = step
    ? `They are on ${step.number && step.total ? `step ${step.number} of ${step.total}` : "this step"}: "${step.instruction}". Parts for this step: ${step.parts.join(", ") || "none"}.`
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
          "Short confirmations (done, ok, next, listo, ya, siguiente) mean next. If what they said is unclear, a filler sound or cut off, pick none and briefly ask what they need. Never invent progress you weren't told. " +
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
// A wrong drawing teaches the wrong move, so each strip is checked before anyone sees it.
export async function judgeStrip(image: string, instruction: string): Promise<{ ok: boolean; problem: string }> {
  return ask<{ ok: boolean; problem: string }>(
    [
      {
        type: "input_text",
        text:
          `This 3-panel drawing should show hands doing this step: "${instruction}" (if it has two actions, showing only the first is fine). ` +
          "First name the part the hands act on in each panel and check it is the part the step names. ok is false if it shows a different action, the wrong part or place, objects used the wrong way or upside down, extra or missing hands or fingers, or anything that would mislead a beginner. " +
          "problem: one short sentence on what is wrong, or empty.",
      },
      { type: "input_image", image_url: image },
    ],
    "strip_check",
    { type: "object", additionalProperties: false, required: ["ok", "problem"], properties: { ok: { type: "boolean" }, problem: { type: "string" } } },
    "low",
  );
}

export type Identified = { name: string; model: string; generic: boolean; sure: boolean };

// "My things": find the exact product from the photo alone, searching the web to confirm, so Timber asks only when it truly can't tell.
export async function identify(image: string, lang: Lang = "en"): Promise<Identified> {
  const res = await fetch("https://api.meta.ai/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      reasoning: { effort: "low" },
      tools: [{ type: "web_search" }],
      input: [
        {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Identify the exact product in this photo: brand and model. Use every clue: logos, printed text, labels, model numbers, shape, colors and design details, " +
                "and search the web to confirm the match. " +
                "generic: true for ordinary unbranded things where the brand doesn't matter (a rubber duck, a plain mug, a hammer). " +
                "model: brand and model, or empty if you can't confirm it. sure: true only if the photo and your search clearly match that exact model. " +
                `name: a short name of the product in ${SPEAK[lang]}, with brand and model if known.`,
            },
            { type: "input_image", image_url: image },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "identified",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["name", "model", "generic", "sure"],
            properties: { name: { type: "string" }, model: { type: "string" }, generic: { type: "boolean" }, sure: { type: "boolean" } },
          },
        },
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Spark ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  const text = (data.output ?? [])
    .filter((item: { phase?: string }) => item.phase !== "commentary")
    .flatMap((item: { content?: { type: string; text: string }[] }) => item.content ?? [])
    .filter((c: { type: string }) => c.type === "output_text")
    .map((c: { text: string }) => c.text)
    .join("");
  // With web search the model can narrate before the JSON.
  return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
}

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
