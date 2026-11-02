// Timber's voice lab: speaks the same lines with each setting, then transcribes them back with Muse Voice
// to catch takes in the wrong language or with wrong words. Writes the takes to smoke-output/voice-lab/ to listen to.
// Usage: node --env-file=.env scripts/smoke/voice-lab.mjs
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

const LINES = [
  "¡Hola! Soy Timber. ¿Qué vamos a armar hoy?",
  "Encaja el ladrillo rojo de dos por cuatro en la base verde.",
  "Casi. La pieza azul va una fila más arriba.",
  "¡Sólido! Vamos con el siguiente paso.",
  "Esto no lo voy a guiar: llama a un electricista.",
];
// Each candidate is [voice id, extra settings]; native Spanish voices read Spanish without the foreign accent.
const SETTINGS = {
  now: ["c333c7de8a71474bb6091f65be538734", { temperature: 0.4, top_p: 0.5 }],
  chica: ["35929683c49c4ec0bf779dc07d22620b", { temperature: 0.3, top_p: 0.5 }],
  mujer: ["5e816f5a0658460b960881a24733c418", { temperature: 0.3, top_p: 0.5 }],
  verity: ["692eb1e1023242219dc8caae8c56fb12", { temperature: 0.3, top_p: 0.5 }],
  colombiana: ["e296306da5d449999f6e35c2b9f60aea", { temperature: 0.3, top_p: 0.5 }],
};

async function speak(text, [voice, extra]) {
  const res = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.FISH_AUDIO_API_KEY}`, "Content-Type": "application/json", model: "s2.1-pro-free" },
    body: JSON.stringify({ text, format: "wav", reference_id: voice, ...extra }),
  });
  if (!res.ok) throw new Error(`Fish ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

async function transcribe(wav) {
  const form = new FormData();
  form.append("request", new Blob([JSON.stringify({ model: "muse-voice-transcribe-1.0", audioEncoding: "WAV", mode: "PUSH_TO_TALK" })], { type: "application/json" }));
  // Muse Voice wants 16 kHz mono; Fish sends 44.1 kHz.
  const mono = execFileSync("ffmpeg", ["-loglevel", "error", "-i", "pipe:0", "-ar", "16000", "-ac", "1", "-f", "wav", "pipe:1"], { input: wav });
  form.append("audio", new Blob([mono], { type: "audio/wav" }), "line.wav");
  const res = await fetch("https://api.meta.ai/v1/asr/transcribe", { method: "POST", headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY}`, Accept: "application/json" }, body: form });
  const data = await res.json();
  return res.ok ? data.transcript ?? "" : `(error ${res.status})`;
}

const words = (s) => s.toLowerCase().normalize("NFD").replace(/[^a-z\s]/g, "").split(/\s+/).filter(Boolean);
const overlap = (a, b) => {
  const want = new Set(words(a));
  return words(b).filter((w) => want.has(w)).length / Math.max(want.size, 1);
};
const foreign = (s) => /[぀-ヿ㐀-鿿가-힯]/.test(s);
// Zero-crossing rate per take: a rough stand-in for how high the voice sits, to see if the tone jumps between lines.
const zcr = (wav) => {
  let cross = 0;
  for (let i = 46; i < wav.length - 2; i += 2) if ((wav.readInt16LE(i) >= 0) !== (wav.readInt16LE(i - 2) >= 0)) cross++;
  return Math.round(cross / ((wav.length - 44) / 2 / 44100));
};

await mkdir("smoke-output/voice-lab", { recursive: true });
for (const [name, extra] of Object.entries(SETTINGS)) {
  const rates = [];
  let bad = 0;
  for (const [i, line] of LINES.entries()) {
    const wav = await speak(line, extra);
    await writeFile(`smoke-output/voice-lab/${name}-${i + 1}.wav`, wav);
    const heard = await transcribe(wav);
    const score = overlap(line, heard);
    const wrong = foreign(heard) || score < 0.6;
    if (wrong) bad++;
    rates.push(zcr(wav));
    console.log(`${name} ${i + 1} ${wrong ? "BAD " : "ok  "} ${Math.round(score * 100)}%  "${heard}"`);
  }
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...LINES.flatMap((_, i) => ["-i", `smoke-output/voice-lab/${name}-${i + 1}.wav`]), "-filter_complex", `${LINES.map((_, i) => `[${i}:a]`).join("")}concat=n=${LINES.length}:v=0:a=1`, `smoke-output/voice-lab/${name}.mp3`]);
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
  const spread = Math.sqrt(rates.reduce((a, b) => a + (b - mean) ** 2, 0) / rates.length);
  console.log(`== ${name}: ${bad} bad takes, tone spread ${Math.round((spread / mean) * 100)}% (lower = steadier)\n`);
}
