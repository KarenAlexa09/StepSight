import type { Manual, Step } from "./manual";
import { clearReplay, freshProgress, saveManual, saveProgress } from "./progress";

const PHOTOS = ["/demo/parts.jpg", "/demo/step1.jpg", "/demo/step2.jpg", "/demo/step3.jpg"];
const MISTAKE = "/demo/wrong.jpg";

const step = (number: number, instruction: string, name: string, color: string, to: string, check: string): Step => ({
  number,
  page: number,
  instruction,
  parts: [{ name, color, quantity: 1 }],
  check,
  target: `${color} brick`,
  motion: { type: "connect", direction: "down", to },
});

const DEMO: Manual = {
  title: "Mini tower (demo)",
  mode: "build",
  demo: true,
  steps: [
    step(1, "Snap the red 2x4 brick onto the green baseplate.", "2x4 brick", "red", "green baseplate", "The red brick sits on the green baseplate."),
    step(2, "Snap the blue 2x2 brick on top of the red brick.", "2x2 brick", "blue", "red brick", "The blue brick sits on top of the red brick."),
    step(3, "Snap the yellow 2x4 brick on top of the blue brick.", "2x4 brick", "yellow", "blue brick", "The yellow brick sits on top of the blue brick."),
  ],
};

export function startDemo() {
  saveManual(DEMO);
  saveProgress(freshProgress());
  clearReplay();
}

export function demoPhoto(step: number, checking: boolean, triedThisStep: boolean) {
  if (!checking) return PHOTOS[step];
  if (step === 1 && !triedThisStep) return MISTAKE;
  return PHOTOS[step + 1];
}
