import {
  buildObjectPrompt,
  decodeMaskToSVGPath,
  frameIndexOf,
  parseImageStream,
  parseVideoStream,
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

export async function segmentBox(image: string, size: { width: number; height: number }, box: Box): Promise<Match[]> {
  const matches = await segment(image, buildObjectPrompt({ size, objects: [{ id: 1, prompts: [{ box }] }] }));
  return matches.length ? matches : [{ id: "1", bounds: box, size: [1, 1], path: "M0 0H1V1H0Z" }];
}

const headers = () => ({ Authorization: `Bearer ${process.env.MODEL_API_KEY}` });

// Upload once, then each prompt reads the same clip by id.
export async function uploadVideo(video: Blob): Promise<string> {
  const form = new FormData();
  form.append("purpose", "user_data");
  form.append("file", video, "clip.mp4");
  const res = await fetch("https://api.meta.ai/v1/files", { method: "POST", headers: headers(), body: form });
  const data = await res.json();
  if (!res.ok || !data.id) throw new Error(`Upload ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return data.id;
}

// Where the part is at the end of the clip: SAM tracks it through hands and camera moves, so the last frame is the result.
export async function lastBox(fileId: string, prompt: string): Promise<Box | null> {
  const res = await fetch("https://api.meta.ai/v1/responses", {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "sam-3.1",
      stream: true,
      metadata: { mask_encoding: "one_bit" },
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_video", file_id: fileId }] }],
    }),
  });
  if (!res.ok || !res.body) throw new Error(`SAM ${res.status}: ${await res.text()}`);
  const result = await parseVideoStream(sseEvents(res.body)).finalResult;
  const boxes = recordsOfKind(result.records, "box");
  const last = Math.max(-1, ...boxes.map((b) => frameIndexOf(b) ?? -1));
  const box = boxes.find((b) => frameIndexOf(b) === last);
  return box ? { left: box.left, top: box.top, right: box.right, bottom: box.bottom } : null;
}
