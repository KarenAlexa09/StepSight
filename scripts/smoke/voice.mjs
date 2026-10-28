import { readFile } from "node:fs/promises";
import { arg, post } from "./lib.mjs";

const wav = arg(0, "npm run smoke:voice -- path/to/clip.wav  (mono, 16-bit PCM, 16 or 24 kHz)");

const form = new FormData();
form.append(
  "request",
  new Blob([JSON.stringify({ model: "muse-voice-transcribe-1.0", audioEncoding: "WAV", mode: "PUSH_TO_TALK" })], {
    type: "application/json",
  }),
);
form.append("audio", new Blob([await readFile(wav)], { type: "audio/wav" }), "clip.wav");

const { json, seconds } = await post("/asr/transcribe", form);

console.log(JSON.stringify(json, null, 2));
console.log(`\n${seconds}s`);
