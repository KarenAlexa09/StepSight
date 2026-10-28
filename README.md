# StepSight

A camera guide that highlights the exact part, follows the real manual and checks every step before you move on.

## Run the app

```bash
npm install
npm run dev
```

The flow:

1. **Home** (`/`): your current project as a folder, level and XP, gallery and "just find something".
2. **New project** (`/manual`): choose **Build something** or **Fix something**, then start from a **photo** (Muse Spark names the product), a **name** ("IKEA Kallax shelf", "bike chain slipped off") or a **PDF link**. Photo and name use Muse Spark's web search to find the manual or a reliable guide; a link is read page by page (about 90 s for 40 pages). Steps are saved on the device.
3. **Check parts** (`/parts`): one photo of all the parts; SAM looks for every color the manual needs.
4. **Build** (`/build`). For fixes, tools and safety come first as a checklist ("Before you start"), and every step is one of three kinds: **do** (just do it, tap Done, no photo), **find** (Timber points out the part on camera) or **verify** (a photo check, used only when the result is visible, like the last step). Assembly manuals verify every step. Each step also says how its part moves (connect to another part, move up/down/left/right, or take off). The "found it" effect then plays that motion: a cut-out copy of the part travels along a dashed arrow to where it goes (the destination part is found with SAM too). The result stays pinned as a small card in the corner of the camera; tap it any time to replay the animation. The reveal is staged like a magic trick: a flash and viewfinder snap, a spotlight with rays, the real part lifting out, a ghost copy travelling along the arrow, shock rings and a screen shake with a "CLICK!" when parts connect. Each beat has a short synthesized sound (`lib/sound.ts`, no audio files) with an on-screen caption and a vibration pulse. **I'm lost** opens a help ladder: replay the animation, a simpler explanation, the manual page (for PDF links), or ask Timber, plus switches for sound, captions, vibration, slower animations and bigger text. Details: the camera, the current step and its part chips. Tap a chip or **Show me** and SAM highlights the part with the "found it" effect. **Done, check me** sends a photo to Muse Spark, which checks it against what the step should look like: you get "Solid." with XP and stars, or "Almost." with what to fix.
5. **Talk to Timber** by mic or text in plain language ("where's the gray clip?", "ok what now?", "say that again"). Muse Voice Transcribe hears it, Muse Spark decides what to do, and Timber answers out loud (Fish Audio).
6. **You built it** (`/done`) and **Gallery** (`/gallery`).
7. **Find** (`/find`): ask for anything in the camera. If SAM can't find it in a busy scene, Muse Spark locates the area first and SAM cuts it out.

Timber has eight poses (wave, reading, point, think, thumbs, oops, celebrate, hardhat) made by editing one master image with Muse Image (`scripts/make-poses.mjs`, then `scripts/cutout.mjs` removes the paper background), each with its own small animation. `npm test` checks the WAV encoder used for voice.

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
