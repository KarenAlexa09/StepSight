# StepSight — Style Guide

Visual direction: **Doodle notebook**. Cream paper, thick black ink strokes, hand-drawn illustrations and pastel touches for the game layer. The app should feel like a friendly manual that comes to life, not a technical tool.

## Colors

| Name | Hex | Use |
| --- | --- | --- |
| Paper | `#FBF7EF` | Background of every screen |
| Ink | `#141414` | Text, borders, primary buttons, illustrations |
| Pencil | `#67625A` | Secondary text, metadata (passes 4.5:1 on Paper) |
| Highlighter | `#E4FF3A` | Part highlight on camera, beaver's hard hat, achievements |
| Lavender | `#C9C3F5` | Project cards (build) |
| Sky | `#BFE3FA` | Project cards (repair / use a product) |
| Mint | `#C8F5DA` | Correct step, streaks |
| Coral | `#FFA8A0` | Needs a fix, badges |

Rules:
- **Mint = correct, coral = fix it.** Never swapped, never decorative.
- Highlighter is the only loud color. Use it sparingly, for what matters.
- No gradients or shadows: everything flat, with an ink border.

### Part highlight on camera

The core feature. It must read on any table:
- Highlighter fill at 55% opacity.
- 2.5 px ink outline following the SAM mask.
- Small label with highlighter background and ink border ("red 2x4").

## Typography (Google Fonts)

| Font | Use |
| --- | --- |
| **Fraunces** (500) | Titles and step instructions |
| **DM Sans** (400 / 500) | Body text and buttons |
| **Space Mono** (400) | Counters: "Step 4/12", "340 xp", streaks |
| **Caveat** (500 / 600) | Timber's voice and hand-written notes. Flavor only: never for instructions or anything the user must read to act |

## Components

- **Borders:** 2 px ink on cards, buttons and the camera view.
- **Corners:** 18 px cards, 14 px camera, pill (999 px) buttons and tags.
- **Primary button:** black pill, paper text, icon on the left. One per screen.
- **Secondary button:** circle or pill with ink border and paper background.
- **Project card:** pastel background, ink border; counter in Space Mono on top, title in Fraunces below.
- **Progress bar:** ink outline, ink fill.
- **Minimal screen:** one part, one step, one sentence. If it doesn't help the current step, it goes.
- **Project cards as folders:** tab on top with the type (BUILD, REPAIR, FIRST USE), faint blueprint grid inside, slightly tilted and stacked.
- **Sticker shadow:** hard 3–4 px ink offset shadow on cards and buttons; the main button gets a highlighter shadow.
- **Background:** paper with a faint dot grid.

## Calm while working, party when winning

- **Work screens** (guided step, parts check, needs a fix): highlighter on the part, one instruction, small Timber. No streaks, confetti, tilted notes or hand-written annotations. Timber talks by voice instead of speech bubbles.
- **Win screens** (step correct, you built it, gallery): full style: confetti doodles, stamp, big type, Timber animated, collectible card.
- Respect the system's reduced-motion setting: no looping animations when it is on.

## Gamification

- **Levels:** Apprentice → Builder → **Foreman**.
- **XP:** points per verified step; bonus when it's right on the first try.
- **Stars:** one per step done right on the first try.
- **Streaks:** consecutive steps without mistakes (mint tag in Space Mono).
- **Badges:** First build · Zero mistakes · Eagle eye (found every part) · Fixer hands (first repair).
- **Big reward:** Timber earns its **hard hat** at Foreman level.
- **"You built it" screen:** time, stars, mistakes caught, XP bar and a share button.

## Mascot: Timber the beaver

Beavers are nature's builders. It's our take on calling someone "a total builder", without using any existing character.

**Personality:** a patient, slightly funny job-site buddy. Celebrates big, corrects without scolding and never does the work for you: it points, cheers and lets you build it.

**Voice** (short, friendly, second person):
- Correct: "Look at you, total foreman!", "Solid. Next one."
- Fix: "Almost. That part goes one row up.", "That's the blue one. We need the red."
- Finding a part: "It's right here, I highlighted it."
- Finish: "You built it. I just watched."
- Never: scolding, exclamation marks on mistakes, "easy" or "simply".

**Design:**
- Black ink doodle on paper, same as the rest of the app's illustrations.
- White body with thick outline, two big front teeth, flat paddle tail with lavender cross-hatch.
- No outfit at first. The highlighter hard hat is earned at Foreman level.
- Check it doesn't resemble any existing branded beaver.

**Poses (8):**
1. Waving (welcome)
2. Reading the manual (PDF loading)
3. Pointing with a tape measure (finding a part)
4. Thinking (verifying a step)
5. Thumbs up (correct step)
6. "Oops", paws on face (needs a fix)
7. Tail slap of joy (streak or new level)
8. Proud, wearing the hard hat (Foreman / final screen)

### Generating it with Muse Image

1. **Master sheet** (`/v1/images/generations`, model `muse-image-1.0`). Base prompt:

   > Cute beaver mascot character, hand-drawn black ink doodle style, thick uneven black outlines, white body, two big front teeth, flat paddle tail with lavender (#C9C3F5) cross-hatch, simple dot eyes, friendly expression, front view, standing, on plain cream paper background (#FBF7EF), no shading, no gradients, minimal flat illustration, original character

2. Pick the best result. That's the **official reference**.
3. **Every pose is an edit of the reference** (`/v1/images/edits`), not a new generation, so the character stays consistent. Example: "Same beaver character, same style, now giving a thumbs up and smiling".
4. Save final images in `public/mascot/` with simple names: `wave.png`, `correct.png`, `oops.png`…
5. Mention in the README and the demo video that the mascot was made with Muse Image.

## Illustrations

Same doodle style as the mascot: welcome, empty states and celebrations. Four-point ink sparkles for achievement moments.

## Don'ts

- Nothing that recalls LEGO in name, logo or brand colors (strong red, yellow and blue with bricks). Avoid "Master Builder", a LEGO term.
- No Bob the Builder: no name, image or catchphrases.
- No busy screens: when in doubt, remove it.
