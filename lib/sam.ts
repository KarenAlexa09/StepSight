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
  confidence?: number;
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
  const confidence = new Map(recordsOfKind(result.records, "box").map((b) => [b.objectId, b.confidence ?? 1]));
  return recordsOfKind(result.records, "mask")
    .filter((record) => (confidence.get(record.objectId) ?? 0) >= minConfidence)
    .map((record) => ({
      id: record.objectId,
      bounds: record.bounds,
      size: [record.mask.width, record.mask.height] as [number, number],
      path: decodeMaskToSVGPath(record.mask),
      confidence: confidence.get(record.objectId),
    }))
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
}

export async function segmentBox(image: string, size: { width: number; height: number }, box: Box): Promise<Match[]> {
  // Spark's boxes are tight and a bit off: a wider box plus a point on the piece's center makes SAM take the whole piece, not a corner of it.
  const padX = Math.round((box.right - box.left) * 0.12);
  const padY = Math.round((box.bottom - box.top) * 0.12);
  const wide = {
    left: Math.max(0, box.left - padX),
    top: Math.max(0, box.top - padY),
    right: Math.min(size.width, box.right + padX),
    bottom: Math.min(size.height, box.bottom + padY),
  };
  const center = { x: Math.round((box.left + box.right) / 2), y: Math.round((box.top + box.bottom) / 2) };
  const matches = await segment(image, buildObjectPrompt({ size, objects: [{ id: 1, prompts: [{ box: wide, points: [center] }] }] }), 0);
  return matches.length ? matches : [{ id: "1", bounds: box, size: [1, 1], path: "M0 0H1V1H0Z" }];
}
