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
};
export type Manual = { title: string; steps: Step[]; prep?: string[]; mode?: Mode; pdf?: string };
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
  required: ["title", "prep", "steps"],
  properties: {
    title: { type: "string" },
    prep: { type: "array", items: { type: "string" }, description: "Tools, materials and safety to get ready before step 1. Empty for assembly manuals." },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["number", "page", "instruction", "parts", "check", "kind", "target", "motion"],
        properties: {
          number: { type: "integer" },
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

function prompt(source: Source) {
  if (source.kind === "pdf")
    return `This is an assembly manual. Turn it into build steps in order. ${FORMAT} ${KINDS} Use kind 'verify' for every step. Leave prep empty.`;
  if (source.mode === "fix")
    return (
      `Search the web for reliable instructions to fix or do this: "${source.query}". Turn them into 5 to 8 clear steps that are physical actions on the object. ${FORMAT} ${KINDS} ` +
      "Put tools, materials and safety in prep, NOT in steps: never make a step out of putting on gloves, stopping, getting ready or washing hands. " +
      "Use verify only for steps whose result is visible, and make the last step a verify step that shows it is fixed. Leave parts empty. Set page to 0."
    );
  return (
    `Search the web for the official assembly instructions or manual for: "${source.query}". Turn them into build steps in order. ${FORMAT} ${KINDS} ` +
    "Use kind 'verify' for every step. Leave prep empty. Set page to 0 if you can't tell the page."
  );
}

function headers() {
  return { Authorization: `Bearer ${process.env.MODEL_API_KEY}`, "Content-Type": "application/json" };
}

export async function startReading(source: Source): Promise<string> {
  const content: unknown[] = [{ type: "input_text", text: prompt(source) }];
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
