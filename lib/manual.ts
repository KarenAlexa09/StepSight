const API = "https://api.meta.ai/v1/responses";
export const MANUAL_KEY = "stepsight.manual";

export type Mode = "build" | "fix";
export type Part = { name: string; color: string; quantity: number };
export type Kind = "do" | "find" | "verify";
export type Motion = { type: "connect" | "move" | "remove" | "none"; direction: string; to: string };
export type Step = {
  number: number;
  page: number;
  instruction: string;
  parts: Part[];
  check: string;
  kind?: Kind;
  target?: string;
  motion?: Motion;
  safety?: boolean;
};
export type Hazard = "none" | "electric" | "gas" | "sharp" | "heavy";
export type Origin = { name: string; url: string; official: boolean; specific?: boolean };
export type Lang = "en" | "es";
export type Manual = {
  title: string;
  steps: Step[];
  prep?: string[];
  mode?: Mode;
  pdf?: string;
  demo?: "tower" | "lamp";
  hazard?: Hazard;
  source?: Origin;
};
export type Source = { kind: "pdf"; url: string } | { kind: "search"; query: string; mode: Mode };

const part = {
  type: "object",
  additionalProperties: false,
  required: ["name", "color", "quantity"],
  properties: {
    name: { type: "string" },
    color: { type: "string", description: "Plain color name, e.g. red, light gray, tan. Empty if color doesn't matter." },
    quantity: { type: "integer" },
  },
};

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "hazard", "source", "prep", "steps"],
  properties: {
    title: { type: "string" },
    hazard: { type: "string", enum: ["none", "electric", "gas", "sharp", "heavy"], description: "Main physical risk of doing this wrong: electric (mains power), gas, sharp (blades, cutting), heavy (lifting, tipping), otherwise none." },
    source: {
      type: "object",
      additionalProperties: false,
      required: ["name", "url", "official", "specific"],
      properties: {
        name: { type: "string", description: "Site or brand the instructions come from. Empty when reading a given PDF." },
        url: { type: "string", description: "https link to the page or manual used. Empty when reading a given PDF." },
        official: { type: "boolean", description: "True only if it is the manufacturer's own manual or site." },
        specific: { type: "boolean", description: "True only if the page is written for the exact brand and model asked for, not a generic guide for the product type." },
      },
    },
    prep: { type: "array", items: { type: "string" }, description: "Tools, materials and safety to get ready before step 1. Empty for assembly manuals." },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["number", "page", "instruction", "parts", "check", "kind", "target", "motion", "safety"],
        properties: {
          number: { type: "integer" },
          safety: { type: "boolean", description: "True only for the step that makes the work safe, such as unplugging or turning the gas off." },
          kind: { type: "string", enum: ["do", "find", "verify"] },
          motion: {
            type: "object",
            additionalProperties: false,
            required: ["type", "direction", "to"],
            properties: {
              type: { type: "string", enum: ["connect", "move", "remove", "none"] },
              direction: { type: "string", enum: ["up", "down", "left", "right", ""] },
              to: { type: "string", description: "Short name of the part it connects to, empty otherwise." },
            },
          },
          target: { type: "string", description: "Short noun phrase for the part to look for with the camera, empty if none." },
          page: { type: "integer", description: "Page in the manual, or 0 when there is no page." },
          instruction: { type: "string" },
          parts: { type: "array", items: part },
          check: { type: "string" },
        },
      },
    },
  },
};

const FORMAT =
  "For each step give the page it is on, one short instruction a beginner can follow, the parts added or tools used " +
  "in that step, and what should be visibly true when the step is done (check).";

const KINDS =
  "For each step set kind: 'verify' when the result can be seen in a photo of the object; 'find' when the person must first locate a part " +
  "(put its short name in target); 'do' for anything else. Set target to the main part involved when there is one, otherwise empty. " +
  "Also set motion for the target part: type 'connect' when it is attached or pressed onto another part (to = that part's short name), " +
  "'move' when it only slides or turns (direction up, down, left or right), 'remove' when it is taken off or out (direction it leaves toward), " +
  "otherwise 'none'. Leave direction and to empty when they don't apply.";

const SAFETY =
  "Set hazard to the main physical risk. If hazard is electric or gas, step 1 must be a verify step that makes it safe (safety true, check = it is visibly unplugged or off), " +
  "and the first prep item must say so; this is the one exception to leaving prep empty or keeping safety out of the steps. Otherwise safety is false on every step.";

const LANGUAGE: Record<Lang, string> = {
  en: "",
  es: " Write title, prep, instruction and check in Spanish. Keep target, part names and motion.to in English.",
};

function prompt(source: Source, lang: Lang) {
  return base(source) + ` ${SAFETY}` + LANGUAGE[lang];
}

const MODEL_FIRST =
  "Look for the manufacturer's page or manual for that exact brand and model first, then a guide written for that exact model; use a generic guide only if nothing specific exists, and then set specific to false. ";

function base(source: Source) {
  if (source.kind === "pdf")
    return `This is an assembly manual. Turn it into build steps in order. ${FORMAT} ${KINDS} Use kind 'verify' for every step. Leave prep empty. Leave source name and url empty.`;
  if (source.mode === "fix")
    return (
      `Search the web for reliable instructions to fix or do this: "${source.query}". ${MODEL_FIRST}Turn them into 5 to 8 clear steps that are physical actions on the object. ${FORMAT} ${KINDS} ` +
      "Put tools, materials and safety in prep, NOT in steps: never make a step out of putting on gloves, stopping, getting ready or washing hands. " +
      "Use verify only for steps whose result is visible, and make the last step a verify step that shows it is fixed. Leave parts empty. Set page to 0. Fill source with the page you used."
    );
  return (
    `Search the web for the official assembly instructions or manual for: "${source.query}". ${MODEL_FIRST}Turn them into build steps in order. ${FORMAT} ${KINDS} ` +
    "Use kind 'verify' for every step. Leave prep empty. Set page to 0 if you can't tell the page. Fill source with the manual or page you used."
  );
}

function headers() {
  return { Authorization: `Bearer ${process.env.MODEL_API_KEY}`, "Content-Type": "application/json" };
}

export async function startReading(source: Source, lang: Lang = "en"): Promise<string> {
  const content: unknown[] = [{ type: "input_text", text: prompt(source, lang) }];
  if (source.kind === "pdf") content.push({ type: "input_file", file_url: source.url });

  const res = await fetch(API, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      // Wonder ignored file_url in background mode and made up a manual; Spark reads the link and is 2x faster.
      model: "muse-spark-1.3",
      background: true,
      ...(source.kind === "search" && { tools: [{ type: "web_search" }] }),
      input: [{ type: "message", role: "user", content }],
      text: { format: { type: "json_schema", name: "manual", schema, strict: true } },
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.id) throw new Error(`Spark ${res.status}: ${JSON.stringify(data)}`);
  return data.id;
}

export type Reading = { status: "reading" } | { status: "done"; manual: Manual } | { status: "failed" };

export async function checkReading(id: string): Promise<Reading> {
  const res = await fetch(`${API}/${id}`, { headers: headers() });
  const data = await res.json();
  if (!res.ok) throw new Error(`Spark ${res.status}: ${JSON.stringify(data)}`);
  if (data.status === "queued" || data.status === "in_progress") return { status: "reading" };
  if (data.status !== "completed") return { status: "failed" };

  const text = (data.output ?? [])
    .flatMap((item: { content?: { type: string; text: string }[] }) => item.content ?? [])
    .filter((c: { type: string }) => c.type === "output_text")
    .map((c: { text: string }) => c.text)
    .join("");
  // With web search the model narrates before the JSON.
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  let manual: Manual;
  try {
    manual = JSON.parse(json);
  } catch {
    return { status: "failed" };
  }
  if (!manual.steps?.length) return { status: "failed" };
  // Sources restart numbering per sub-build; the app needs one running order.
  manual.steps = manual.steps.map((step, i) => ({ ...step, number: i + 1 }));
  return { status: "done", manual };
}
