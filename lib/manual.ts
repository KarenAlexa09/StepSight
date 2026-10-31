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

// What the reading screen shows while Spark works, sent to the browser as one JSON object per line.
export type ReadEvent = { type: "search"; query: string } | { type: "open"; url: string } | { type: "done"; manual: Manual } | { type: "failed" };

type Item = { type: string; phase?: string; action?: { type: string; query?: string; url?: string }; content?: { type: string; text: string }[] };

// Streams instead of background polling: polling shows nothing until the end (about 30 s to 3 min).
export async function readManual(source: Source, lang: Lang, emit: (event: ReadEvent) => void): Promise<void> {
  const content: unknown[] = [{ type: "input_text", text: prompt(source, lang) }];
  if (source.kind === "pdf") content.push({ type: "input_file", file_url: source.url });

  const res = await fetch(API, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      // Wonder ignored file_url and made up a manual; Spark reads the link and is 2x faster.
      model: "muse-spark-1.3",
      stream: true,
      ...(source.kind === "search" && { tools: [{ type: "web_search" }] }),
      input: [{ type: "message", role: "user", content }],
      text: { format: { type: "json_schema", name: "manual", schema, strict: true } },
    }),
  });
  if (!res.ok || !res.body) throw new Error(`Spark ${res.status}: ${await res.text()}`);

  let buffer = "";
  for await (const chunk of res.body.pipeThrough(new TextDecoderStream())) {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      const event = JSON.parse(data);
      const action: Item["action"] = event.item?.action;
      if (event.type === "response.output_item.done" && event.item.type === "web_search_call" && action) {
        if (action.type === "search" && action.query) emit({ type: "search", query: action.query });
        if (action.type === "open_page" && action.url) emit({ type: "open", url: action.url });
      }
      if (event.type === "response.completed") {
        const manual = parseManual(event.response.output ?? []);
        return emit(manual ? { type: "done", manual } : { type: "failed" });
      }
      if (event.type === "response.failed" || event.type === "error") return emit({ type: "failed" });
    }
  }
  emit({ type: "failed" });
}

export function parseManual(output: Item[]): Manual | null {
  const text = output
    .filter((item) => item.phase !== "commentary")
    .flatMap((item) => item.content ?? [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text)
    .join("");
  // With web search the model narrates before the JSON and drops citation marks like 【123†L69-L72】 into strings.
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1).replace(/\s*【[^】]*】/g, "");
  let manual: Manual;
  try {
    manual = JSON.parse(json);
  } catch {
    return null;
  }
  if (!manual.steps?.length) return null;
  // Sources restart numbering per sub-build; the app needs one running order.
  manual.steps = manual.steps.map((step, i) => ({ ...step, number: i + 1 }));
  return manual;
}
