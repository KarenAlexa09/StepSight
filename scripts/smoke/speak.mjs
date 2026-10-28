import { arg, save } from "./lib.mjs";

const text = arg(0, 'npm run smoke:speak -- "Look at you, total foreman."', "Solid. Next one.");
const key = process.env.FISH_AUDIO_API_KEY;
if (!key) {
  console.error("Missing FISH_AUDIO_API_KEY in .env");
  process.exit(1);
}

const started = performance.now();
const res = await fetch("https://api.fish.audio/v1/tts", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", model: "s2.1-pro-free" },
  body: JSON.stringify({ text, format: "mp3", reference_id: "711cf3ed00ab441a8f54a45058047b7a" }),
});
const seconds = ((performance.now() - started) / 1000).toFixed(1);
if (!res.ok) throw new Error(`${res.status} after ${seconds}s\n${await res.text()}`);

const path = await save("timber-voice.mp3", Buffer.from(await res.arrayBuffer()));
console.log(`Saved ${path} · ${seconds}s`);
