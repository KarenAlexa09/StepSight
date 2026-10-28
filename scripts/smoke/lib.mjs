import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname } from "node:path";

export const BASE_URL = "https://api.meta.ai/v1";

const MIME = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".wav": "audio/wav",
};

export function apiKey() {
  const key = process.env.MODEL_API_KEY;
  if (!key) {
    console.error("Missing MODEL_API_KEY. Copy .env.example to .env and add your key.");
    process.exit(1);
  }
  return key;
}

export function arg(index, usage, fallback) {
  const value = process.argv[2 + index] ?? fallback;
  if (value === undefined) {
    console.error(`Usage: ${usage}`);
    process.exit(1);
  }
  return value;
}

export async function dataUrl(path) {
  const type = MIME[extname(path).toLowerCase()];
  if (!type) throw new Error(`Unsupported file type: ${path}`);
  const bytes = await readFile(path);
  return `data:${type};base64,${bytes.toString("base64")}`;
}

function timer() {
  const started = performance.now();
  return () => ((performance.now() - started) / 1000).toFixed(1);
}

export async function post(path, body) {
  const elapsed = timer();
  const isForm = body instanceof FormData;
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      ...(isForm ? {} : { "Content-Type": "application/json" }),
    },
    body: isForm ? body : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} on ${path} after ${elapsed()}s\n${text}`);
  return { json: JSON.parse(text), seconds: elapsed() };
}

export async function postStream(path, body) {
  const elapsed = timer();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!res.ok) throw new Error(`${res.status} on ${path} after ${elapsed()}s\n${await res.text()}`);

  let buffer = "";
  let text = "";
  for await (const chunk of res.body.pipeThrough(new TextDecoderStream())) {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      const event = JSON.parse(data);
      if (event.type === "response.output_text.delta") text += event.delta;
      if (event.type === "error") throw new Error(JSON.stringify(event));
    }
  }
  return { text, seconds: elapsed() };
}

export function outputText(response) {
  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text)
    .join("");
}

export async function save(name, data) {
  await mkdir("smoke-output", { recursive: true });
  const path = `smoke-output/${name}`;
  await writeFile(path, data);
  return path;
}
