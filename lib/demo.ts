import type { Manual, Step } from "./manual";
import { clearReplay, freshProgress, saveManual, saveProgress } from "./progress";

type Kind = "tower" | "lamp";

const SETS: Record<Kind, { photos: string[]; mistake: string; mistakeStep: number }> = {
  tower: { photos: ["/demo/parts.jpg", "/demo/step1.jpg", "/demo/step2.jpg", "/demo/step3.jpg"], mistake: "/demo/wrong.jpg", mistakeStep: 1 },
  lamp: {
    photos: ["/demo/lamp0.jpg", "/demo/lamp1.jpg", "/demo/lamp2.jpg", "/demo/lamp3.jpg", "/demo/lamp4.jpg"],
    mistake: "/demo/lamp-wrong.jpg",
    mistakeStep: 0,
  },
};

const step = (number: number, instruction: string, name: string, color: string, to: string, check: string): Step => ({
  number,
  page: number,
  instruction,
  parts: [{ name, color, quantity: 1 }],
  check,
  target: `${color} brick`,
  motion: { type: "connect", direction: "down", to },
});

const TOWER: Manual = {
  title: "Mini tower (demo)",
  mode: "build",
  demo: "tower",
  steps: [
    step(1, "Snap the red 2x4 brick onto the green baseplate.", "2x4 brick", "red", "green baseplate", "The red brick sits on the green baseplate."),
    step(2, "Snap the blue 2x2 brick on top of the red brick.", "2x2 brick", "blue", "red brick", "The blue brick sits on top of the red brick."),
    step(3, "Snap the yellow 2x4 brick on top of the blue brick.", "2x4 brick", "yellow", "blue brick", "The yellow brick sits on top of the blue brick."),
  ],
};

const LAMP: Manual = {
  title: "Change a lamp bulb (demo)",
  mode: "fix",
  demo: "lamp",
  hazard: "electric",
  prep: ["Unplug the lamp and keep it unplugged.", "Have a new bulb of the same type ready.", "Let the old bulb cool down first."],
  steps: [
    {
      number: 1,
      page: 0,
      instruction: "Unplug the lamp from the power strip.",
      parts: [],
      check: "The lamp's plug is out of the power strip.",
      kind: "verify",
      safety: true,
      target: "plug",
      motion: { type: "remove", direction: "right", to: "" },
    },
    {
      number: 2,
      page: 0,
      instruction: "Lift the lampshade off the lamp.",
      parts: [],
      check: "The lampshade is off and the bare bulb is visible.",
      kind: "verify",
      target: "lampshade",
      motion: { type: "remove", direction: "left", to: "" },
    },
    {
      number: 3,
      page: 0,
      instruction: "Unscrew the old bulb and take it out.",
      parts: [],
      check: "The old bulb is out and the socket is empty.",
      kind: "verify",
      target: "light bulb",
      motion: { type: "remove", direction: "down", to: "" },
    },
    {
      number: 4,
      page: 0,
      instruction: "Screw in the new bulb and put the shade back on.",
      parts: [],
      check: "A bulb is in the lamp and the lampshade is back on top.",
      kind: "verify",
      target: "light bulb",
      motion: { type: "connect", direction: "up", to: "lamp socket" },
    },
  ],
};

export function startDemo(kind: Kind = "tower") {
  saveManual(kind === "lamp" ? LAMP : TOWER);
  saveProgress(freshProgress());
  clearReplay();
}

export function demoPhoto(kind: Kind | true, step: number, checking: boolean, triedThisStep: boolean) {
  const set = SETS[kind === "lamp" ? "lamp" : "tower"];
  if (!checking) return set.photos[step];
  if (step === set.mistakeStep && !triedThisStep) return set.mistake;
  return set.photos[step + 1];
}
