// Fish Audio library voice for Timber ("Verity"), chosen by ear with scripts/smoke/voice-lab.mjs for both languages.
const TIMBER_VOICE = "692eb1e1023242219dc8caae8c56fb12";

export async function transcribe(wav: Blob): Promise<string> {
  const form = new FormData();
  form.append(
    "request",
    new Blob([JSON.stringify({ model: "muse-voice-transcribe-1.0", audioEncoding: "WAV", mode: "PUSH_TO_TALK" })], {
      type: "application/json",
    }),
  );
  form.append("audio", wav, "command.wav");
  const res = await fetch("https://api.meta.ai/v1/asr/transcribe", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY}`, Accept: "application/json" },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Transcribe ${res.status}: ${JSON.stringify(data)}`);
  return data.transcript ?? "";
}

// Brick sizes read as "two ex four" otherwise.
const spoken = (text: string, lang: "en" | "es") => text.replace(/(\d+)\s*[x×]\s*(\d+)/g, lang === "es" ? "$1 por $2" : "$1 by $2");

export async function speak(text: string, lang: "en" | "es" = "en"): Promise<Response> {
  const res = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.FISH_AUDIO_API_KEY}`,
      "Content-Type": "application/json",
      model: "s2.1-pro-free",
    },
    // Low temperature keeps the tone the same from line to line; language only guides how numbers like "2x4" are read.
    body: JSON.stringify({ text: spoken(text, lang), format: "mp3", reference_id: TIMBER_VOICE, language: lang, temperature: 0.3, top_p: 0.5 }),
  });
  if (!res.ok || !res.body) throw new Error(`Fish ${res.status}: ${await res.text()}`);
  return res;
}
