# StepSight

A camera guide that highlights the exact part, follows the real manual and checks every step before you move on.

## Why not just ask a chatbot?

A chatbot tells you how to do it. StepSight watches you do it.

- **It sees your table.** SAM 3.1 outlines the exact part on your own camera, not a generic picture.
- **It checks every step.** Muse Spark looks at your photo and says what it sees. A guess is not a pass: when the photo is unclear it asks for another angle.
- **It will not let you skip the dangerous step.** For anything electric or gas, step 1 is a camera-checked "it is unplugged / off" and the Skip button is disabled.
- **It shows where the steps come from.** Every guide carries an "Official manual", "Web guide" or "Your PDF" tag with the link.
- **It explains in your language.** Pick Español and the steps, the checks and Timber's voice follow, even when the manual is in English.
- **It works hands-free.** Say what you need; Timber answers out loud.

Built for people who stare at a dense manual and give up: first-time builders, people reading a manual in a second language, and anyone who would rather fix a thing than throw it away.

## Run the app

```bash
npm install
npm run dev
```

The flow:

1. **Home** (`/`): one question, "What do you need?". Say it with the mic (Muse Voice Transcribe), type it, or snap a photo. A voice request shows what Timber heard and sends itself after a moment (tap **Edit** to change it). Under it: example requests, **Try the demo** (no camera or bricks needed: it loads a 3-step mini tower and plays the photos in `public/demo`, including a deliberate mistake on step 2) and a link back to your current project. A bottom tab bar links Home, Projects, New, Gallery and Find.
2. **New project** (`/manual`): Muse Spark reads what you said or showed and works out the product, whether you are building or fixing it, and what is wrong. A photo on its own asks "Is this it?" first (you can flip Build/Fix or rename it); a photo too blurry to tell asks for a better one. Then it uses web search to find the manual or a reliable guide; a pasted PDF link is read page by page (about 90 s for 40 pages). Steps are saved on the device.
3. **Check parts** (`/parts`): one photo of all the parts; SAM looks for every color the manual needs.
4. **Build** (`/build`). For fixes, tools and safety come first as a checklist ("Before you start"); when the job is electric, gas, sharp or heavy a red "Safety first" note shows, the first item must be ticked to start, and for electric and gas step 1 is a camera-checked safety step that cannot be skipped. The guide's source (official manual, web guide or your PDF) is tagged under its title. The verification says what it saw and treats an unclear photo as not done. The language switch (EN/ES on Home, or in **I'm lost**) makes the steps, the checks and Timber's replies Spanish; buttons and labels stay English. There are two demos: a brick tower and **Try the repair demo** (change a lamp bulb, with the unplug step and a deliberate mistake on it). Every step is one of three kinds: **do** (just do it, tap Done, no photo), **find** (Timber points out the part on camera) or **verify** (a photo check, used only when the result is visible, like the last step). Assembly manuals verify every step. Each step also says how its part moves (connect to another part, move up/down/left/right, or take off). The "found it" effect then plays that motion: a cut-out copy of the part travels along a dashed arrow to where it goes (the destination part is found with SAM too). The result stays pinned as a small card in the corner of the camera; tap it any time to replay the animation. The reveal is staged like a magic trick: a flash and viewfinder snap, a spotlight with rays, the real part lifting out, a ghost copy travelling along the arrow, shock rings and a screen shake with a "CLICK!" when parts connect. Each beat has a short synthesized sound (`lib/sound.ts`, no audio files) with an on-screen caption and a vibration pulse. **I'm lost** opens a help ladder: replay the animation, a simpler explanation, the manual page (for PDF links), or ask Timber, plus switches for sound, captions, vibration, slower animations and bigger text. The camera takes most of the screen and the main button is always **Check my step** (or **Done** for steps without a photo). **Show me** is a small button on the camera: tap it or a part chip and SAM highlights the part with the "found it" effect. The check sends a photo to Muse Spark: a correct step flashes a green "Solid!" banner with XP and moves on by itself after a moment, and a wrong one shows a red "Almost." banner with what to fix, a close-up of the piece in question (SAM finds it, the app crops it) and a **Check again** button.
5. **Talk to Timber** by mic or text in plain language ("where's the gray clip?", "ok what now?", "say that again"). Muse Voice Transcribe hears it, Muse Spark decides what to do, and Timber answers out loud (Fish Audio).
6. **You built it** (`/done`): your build replay is the hero, a fast stop-motion cut through the photo of every step, with your stats and a share card. Past builds live in the **Gallery** (`/gallery`).
7. **Find** (`/find`): ask for anything in the camera. If SAM can't find it in a busy scene, Muse Spark locates the area first and SAM cuts it out.

Timber has nine poses (wave, reading, point, think, thumbs, oops, celebrate, hardhat, lean) made by editing one master image with Muse Image (`scripts/make-poses.mjs`, then `scripts/cutout.mjs` removes the paper background), each with its own small animation. `npm test` checks the WAV encoder used for voice.

On a phone (same Wi-Fi): `npm run dev:phone`, then open `https://<your-computer-ip>:3000` and accept the certificate warning. Browsers only allow the camera over HTTPS.

## Smoke tests

Quick checks that each Meta model works with our inputs. Node 22.9+ and no dependencies.

1. Copy `.env.example` to `.env` (or `.env.local`) and add your `MODEL_API_KEY`.
2. Put test files in `samples/` (ignored by git).
3. Run:

| Command | Model | What it checks |
| --- | --- | --- |
| `npm run smoke:spark` | Muse Spark 1.3 | Key and connection |
| `npm run smoke:manual -- samples/manual.pdf` | Muse Wonder | PDF manual → build steps JSON (`smoke-output/manual-steps.json`) |
| `npm run smoke:sam -- samples/parts.jpg "red 2x4 brick"` | SAM 3.1 | Finds the part; overlay in `smoke-output/sam-overlay.svg` |
| `npm run smoke:compare -- samples/step.png samples/build.jpg` | Muse Spark 1.3 | Build photo vs manual step |
| `npm run smoke:voice -- samples/command.wav` | Muse Voice Transcribe | Voice command to text |
| `node scripts/smoke/verify-eval.mjs <folder> [url]` | Muse Spark 1.3 (via `/api/verify`) | Accuracy of the step check on your own good/bad photos (`step.json`, `good/`, `bad/`); needs the app running |
| `npm run smoke:image` | Muse Image | Timber master sheet (`smoke-output/timber-master.png`) |
| `npm run smoke:speak -- "Solid. Next one."` | Fish Audio (`s2.1-pro-free`) | Timber's voice (`smoke-output/timber-voice.mp3`) |

Notes:
- Only the first 50 pages of a PDF are read as images. Pick a manual with 50 pages or fewer, or split it.
- Voice needs WAV, mono, 16-bit PCM at 16 or 24 kHz: `ffmpeg -i in.m4a -ac 1 -ar 24000 -c:a pcm_s16le out.wav`
- Video input only accepts MP4, so step checks send still frames instead of video.
- SAM 3.1 matches parts by color and type but not by size: "white 2x2 brick" also returns white 2x4 bricks. Filter candidates by box shape, then let Muse Spark pick when it's still ambiguous.
- Prompt SAM with color + "piece" ("orange piece"), not a shape word: "orange brick" missed an orange slope.
- Reading a 40-page manual with Muse Wonder takes about 3 minutes, so do it once on upload and cache the steps. Its step numbers restart per sub-build; renumber them in order.
- Muse Spark understands short MP4 clips (what was placed and where) in about 13 s. For live step checks, send 2–3 frames instead.
