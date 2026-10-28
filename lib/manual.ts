const API = "https://api.meta.ai/v1/responses";

export type Part = { name: string; color: string; quantity: number };
export type Step = { number: number; page: number; instruction: string; parts: Part[]; check: string };
export type Manual = { title: string; steps: Step[] };

const part = {
  type: "object",
  additionalProperties: false,
  required: ["name", "color", "quantity"],
  properties: {
    name: { type: "string" },
    color: { type: "string", description: "Plain color name, e.g. red, light gray, tan" },
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
          page: { type: "integer" },
          instruction: { type: "string" },
          parts: { type: "array", items: part },
          check: { type: "string" },
        },
      },
    },
  },
};

function headers() {
  return { Authorization: `Bearer ${process.env.MODEL_API_KEY}`, "Content-Type": "application/json" };
}

export async function startReading(pdfUrl: string): Promise<string> {
  const res = await fetch(API, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      // Wonder ignored file_url in background mode and made up a manual; Spark reads the link and is 2x faster.
      model: "muse-spark-1.3",
      background: true,
      input: [
        {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "This is an assembly manual. Turn it into build steps in order. For each step give the page it is on, " +
                "one short instruction a beginner can follow, the parts added in that step, and what should be " +
                "visibly true when the step is done (check).",
            },
            { type: "input_file", file_url: pdfUrl },
          ],
        },
      ],
      text: { format: { type: "json_schema", name: "manual", schema, strict: true } },
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.id) throw new Error(`Wonder ${res.status}: ${JSON.stringify(data)}`);
  return data.id;
}

export type Reading = { status: "reading" } | { status: "done"; manual: Manual } | { status: "failed" };

export async function checkReading(id: string): Promise<Reading> {
  const res = await fetch(`${API}/${id}`, { headers: headers() });
  const data = await res.json();
  if (!res.ok) throw new Error(`Wonder ${res.status}: ${JSON.stringify(data)}`);
  if (data.status === "queued" || data.status === "in_progress") return { status: "reading" };
  if (data.status !== "completed") return { status: "failed" };

  const text = (data.output ?? [])
    .flatMap((item: { content?: { type: string; text: string }[] }) => item.content ?? [])
    .filter((c: { type: string }) => c.type === "output_text")
    .map((c: { text: string }) => c.text)
    .join("");
  const manual: Manual = JSON.parse(text);
  // Wonder restarts numbering per sub-build; the app needs one running order.
  manual.steps = manual.steps.map((step, i) => ({ ...step, number: i + 1 }));
  return { status: "done", manual };
}
