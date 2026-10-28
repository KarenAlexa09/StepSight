const API = "https://api.meta.ai/v1/responses";
export const MANUAL_KEY = "stepsight.manual";

export type Mode = "build" | "fix";
export type Part = { name: string; color: string; quantity: number };
export type Step = { number: number; page: number; instruction: string; parts: Part[]; check: string };
export type Manual = { title: string; steps: Step[]; mode?: Mode };
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
  required: ["title", "steps"],
  properties: {
    title: { type: "string" },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["number", "page", "instruction", "parts", "check"],
        properties: {
          number: { type: "integer" },
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

function prompt(source: Source) {
  if (source.kind === "pdf") return `This is an assembly manual. Turn it into build steps in order. ${FORMAT}`;
  if (source.mode === "fix")
    return (
      `Search the web for reliable instructions to fix or do this: "${source.query}". Turn them into at most 12 clear steps. ${FORMAT} ` +
      "Put tools or materials in parts using the object's name and an empty color. Set page to 0."
    );
  return (
    `Search the web for the official assembly instructions or manual for: "${source.query}". Turn them into build steps in order. ${FORMAT} ` +
    "Set page to 0 if you can't tell the page."
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
