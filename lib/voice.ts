// Fish Audio library voices for Timber, one native speaker per language: an English voice reading Spanish
// came out with a foreign accent. Pick by ear with scripts/smoke/voice-lab.mjs.
const TIMBER_VOICE = { en: "c333c7de8a71474bb6091f65be538734", es: "692eb1e1023242219dc8caae8c56fb12" };

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

export async function speak(text: string, lang: "en" | "es" = "en"): Promise<Response> {
  const res = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.FISH_AUDIO_API_KEY}`,
      "Content-Type": "application/json",
      model: "s2.1-pro-free",
    },
    // Low temperature keeps the tone the same from line to line; language only guides how numbers like "2x4" are read.
    body: JSON.stringify({ text, format: "mp3", reference_id: TIMBER_VOICE[lang], language: lang, temperature: 0.3, top_p: 0.5 }),
  });
  if (!res.ok || !res.body) throw new Error(`Fish ${res.status}: ${await res.text()}`);
  return res;
}
