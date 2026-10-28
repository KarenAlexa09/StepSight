import { decodeMaskToSVGPath, parseImageStream, recordsOfKind, type ResponsesEvent } from "@meta-sam/parser";

export type Match = {
  id: string;
  bounds: { left: number; top: number; right: number; bottom: number };
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

export async function segment(image: string, prompt: string): Promise<Match[]> {
  const res = await fetch("https://api.meta.ai/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "sam-3.1",
      stream: true,
      metadata: { mask_encoding: "one_bit" },
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
  return recordsOfKind(result.records, "mask").map((record) => ({
    id: record.objectId,
    bounds: record.bounds,
    size: [record.mask.width, record.mask.height],
    path: decodeMaskToSVGPath(record.mask),
  }));
}
