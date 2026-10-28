// Fish Audio library voice "Verity" (energetic young male).
const TIMBER_VOICE = "711cf3ed00ab441a8f54a45058047b7a";

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

export async function speak(text: string): Promise<Response> {
  const res = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.FISH_AUDIO_API_KEY}`,
      "Content-Type": "application/json",
      model: "s2.1-pro-free",
    },
    body: JSON.stringify({ text, format: "mp3", reference_id: TIMBER_VOICE }),
  });
  if (!res.ok || !res.body) throw new Error(`Fish ${res.status}: ${await res.text()}`);
  return res;
}
