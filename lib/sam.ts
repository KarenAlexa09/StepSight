import {
  buildObjectPrompt,
  decodeMaskToSVGPath,
  parseImageStream,
  recordsOfKind,
  type ResponsesEvent,
} from "@meta-sam/parser";

export type Box = { left: number; top: number; right: number; bottom: number };

export type Match = {
  id: string;
  bounds: Box;
  size: [width: number, height: number];
  path: string;
};

async function* sseEvents(body: ReadableStream<BufferSource>): AsyncGenerator<ResponsesEvent> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data && data !== "[DONE]") yield JSON.parse(data);
    }
  }
}

// Drops only SAM's weakest guesses: right and wrong matches overlap around 0.55–0.6, so the real guard is locate() refusing to guess.
const MIN_CONFIDENCE = 0.5;

export async function segment(image: string, prompt: string, minConfidence = MIN_CONFIDENCE): Promise<Match[]> {
  const res = await fetch("https://api.meta.ai/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "sam-3.1",
      stream: true,
      metadata: { mask_encoding: "one_bit", include_confidence: "true" },
      input: [
        {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: image },
          ],
        },
      ],
    }),
  });
  if (!res.ok || !res.body) throw new Error(`SAM ${res.status}: ${await res.text()}`);

  const result = await parseImageStream(sseEvents(res.body)).finalResult;
  const sure = new Set(recordsOfKind(result.records, "box").filter((b) => (b.confidence ?? 1) >= minConfidence).map((b) => b.objectId));
  return recordsOfKind(result.records, "mask").filter((record) => sure.has(record.objectId)).map((record) => ({
    id: record.objectId,
    bounds: record.bounds,
    size: [record.mask.width, record.mask.height],
    path: decodeMaskToSVGPath(record.mask),
  }));
}

export async function segmentBox(image: string, size: { width: number; height: number }, box: Box): Promise<Match[]> {
  const matches = await segment(image, buildObjectPrompt({ size, objects: [{ id: 1, prompts: [{ box }] }] }), 0);
  return matches.length ? matches : [{ id: "1", bounds: box, size: [1, 1], path: "M0 0H1V1H0Z" }];
}
