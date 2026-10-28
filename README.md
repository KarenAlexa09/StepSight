# StepSight

A camera guide that highlights the exact part, follows the real manual and checks every step before you move on.

## Run the app

```bash
npm install
npm run dev
```

Open http://localhost:3000, name a part ("red piece") and tap **Find**, or **Live** to keep looking. **Photo** works without a camera.

Open http://localhost:3000/manual and paste a PDF link (for example a LEGO building instructions PDF). Muse Spark reads it in the background (about 90 s for 40 pages) and the steps are saved on the device.

With a manual saved, the home screen becomes a step-by-step guide: tap a part chip or **Show me** to find it, **Next** / **Back** to move, and Timber reads each step aloud (Fish Audio). Tap the mic and say "next", "back", "where is it" or "repeat" (Muse Voice Transcribe). `npm test` checks the WAV encoder used for voice.

Then **Check parts** (`/parts`): take one photo of all the parts and SAM looks for every color the manual needs, comparing how many it sees with how many the manual asks for.

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
