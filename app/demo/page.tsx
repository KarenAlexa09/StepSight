"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Manual, Step } from "../../lib/manual";
import { clearReplay, freshProgress, saveManual, saveProgress } from "../../lib/progress";

const PHOTOS = [
  { src: "/demo/parts.jpg", label: "Loose pieces" },
  { src: "/demo/step1.jpg", label: "After step 1" },
  { src: "/demo/step2.jpg", label: "After step 2" },
  { src: "/demo/step3.jpg", label: "Finished" },
  { src: "/demo/wrong.jpg", label: "Mistake on purpose" },
];

const step = (number: number, instruction: string, name: string, color: string, to: string, check: string): Step => ({
  number,
  page: number,
  instruction,
  parts: [{ name, color, quantity: 1 }],
  check,
  kind: "do",
  target: `${color} brick`,
  motion: { type: "connect", direction: "down", to },
});

const DEMO: Manual = {
  title: "Mini tower (demo)",
  mode: "build",
  steps: [
    step(1, "Snap the red 2x4 brick onto the green baseplate.", "2x4 brick", "red", "green baseplate", "The red brick sits on the green baseplate."),
    step(2, "Snap the blue 2x2 brick on top of the red brick.", "2x2 brick", "blue", "red brick", "The blue brick sits on top of the red brick."),
    step(3, "Snap the yellow 2x4 brick on top of the blue brick.", "2x4 brick", "yellow", "blue brick", "The yellow brick sits on top of the blue brick."),
  ],
};

export default function Demo() {
  const router = useRouter();
  const [i, setI] = useState(0);
  const photo = PHOTOS[i];

  function load() {
    saveManual(DEMO);
    saveProgress(freshProgress());
    clearReplay();
    router.push("/parts");
  }

  return (
    <main className="screen paper">
      <header className="top">
        <Link href="/" className="round" aria-label="Home">
          ←
        </Link>
        <span className="brand">Demo kit</span>
      </header>
      <p className="hand">Open this page on a laptop, then point your phone's camera at the screen.</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.src} alt={photo.label} style={{ width: "100%", borderRadius: 16, border: "2px solid var(--ink)" }} />
      <div className="row3">
        <button type="button" className="secondary" onClick={() => setI((i + PHOTOS.length - 1) % PHOTOS.length)}>
          ← Prev
        </button>
        <span className="chip">{photo.label}</span>
        <button type="button" className="secondary" onClick={() => setI((i + 1) % PHOTOS.length)}>
          Next →
        </button>
      </div>
      <button type="button" className="cta" onClick={load}>
        Load the demo manual
      </button>
    </main>
  );
}
