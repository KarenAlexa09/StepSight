import { writeFile } from "node:fs/promises";

const VOICES = {
  "a-androgynous-calm": "e29c2758c6e74b7e9650c13413d21ca0",
  "b-soft-playful": "b97797f2111743548499008e5896beeb",
  "c-neutral-bright": "59e9dc1cb20c452584788a2690c80970",
  "d-neutral-cheerful": "c333c7de8a71474bb6091f65be538734",
};
const text = "Hi, I'm Timber! Let's build this together. Snap the red brick onto the green baseplate. Look at you, total foreman!";

for (const [name, id] of Object.entries(VOICES)) {
  const res = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.FISH_AUDIO_API_KEY}`, "Content-Type": "application/json", model: "s2.1-pro-free" },
    body: JSON.stringify({ text, format: "mp3", reference_id: id }),
  });
  if (!res.ok) {
    console.log(name, res.status, (await res.text()).slice(0, 120));
    continue;
  }
  await writeFile(`smoke-output/voices/${name}.mp3`, Buffer.from(await res.arrayBuffer()));
  console.log(name, "ok");
}
