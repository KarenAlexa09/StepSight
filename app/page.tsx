"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Timber from "../components/Timber";
import { startDemo } from "../lib/demo";
import type { Manual } from "../lib/manual";
import { level, loadManual, loadProgress, type Progress } from "../lib/progress";

const iconProps = { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export default function Home() {
  const router = useRouter();
  const [manual, setManual] = useState<Manual | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);

  useEffect(() => {
    setManual(loadManual());
    setProgress(loadProgress());
  }, []);

  const xp = progress?.xp ?? 0;
  const { name } = level(xp);
  const steps = manual?.steps.length ?? 0;
  const current = Math.min((progress?.step ?? 0) + 1, steps);
  const finished = Boolean(progress?.finishedAt);

  return (
    <main className="screen paper home">
      <header className="top">
        <span className="brand">StepSight</span>
        <span className="chip hi">★ {xp} xp</span>
      </header>

      <section className="greet">
        <div className="greet-timber">
          <Timber pose="wave" size={124} />
        </div>
        <p className="hand">Hi there, {name.toLowerCase()}!</p>
        <h1 className="title big">What are we building today?</h1>
      </section>

      {manual ? (
        <section className="continue">
          <div className="row-between">
            <span className="kicker">CONTINUE · {manual.mode === "fix" ? "FIX" : "BUILD"}</span>
            <span className="kicker">{finished ? "done" : `step ${current} of ${steps}`}</span>
          </div>
          <h2 className="folder-title">{manual.title}</h2>
          <span className="dots" style={{ gridTemplateColumns: `repeat(${steps}, minmax(0, 1fr))` }} aria-hidden="true">
            {Array.from({ length: steps }, (_, i) => (
              <span key={i} className={finished || i < current - 1 ? "done" : i === current - 1 ? "now" : ""} />
            ))}
          </span>
          <Link href={finished ? "/done" : "/build"} className="cta">
            {finished ? "See your result →" : "Continue building →"}
          </Link>
        </section>
      ) : (
        <section className="continue">
          <p className="hand">Paste a manual and I&apos;ll guide you step by step.</p>
          <Link href="/manual" className="cta">
            Start a project →
          </Link>
        </section>
      )}

      <div className="quick">
        <Link href="/manual" className="qtile mint">
          <svg {...iconProps}>
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
          Snap or paste
        </Link>
        <Link href="/parts" className="qtile coral">
          <svg {...iconProps}>
            <rect x="4" y="4" width="7" height="7" rx="1.5" />
            <rect x="13" y="4" width="7" height="7" rx="1.5" />
            <rect x="4" y="13" width="7" height="7" rx="1.5" />
          </svg>
          Check my parts
        </Link>
        <button
          type="button"
          className="qtile dashed"
          onClick={() => {
            startDemo();
            router.push("/build");
          }}
        >
          <svg {...iconProps}>
            <path d="M8 5v14l11-7z" />
          </svg>
          Try the demo
        </button>
      </div>
    </main>
  );
}
