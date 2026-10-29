"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Timber from "../components/Timber";
import { startDemo } from "../lib/demo";
import type { Manual } from "../lib/manual";
import { level, loadBuilds, loadManual, loadProgress, type Build, type Progress } from "../lib/progress";

export default function Home() {
  const router = useRouter();
  const [manual, setManual] = useState<Manual | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [builds, setBuilds] = useState<Build[]>([]);

  useEffect(() => {
    setManual(loadManual());
    setProgress(loadProgress());
    setBuilds(loadBuilds());
  }, []);

  const xp = progress?.xp ?? 0;
  const { name } = level(xp);
  const steps = manual?.steps.length ?? 0;
  const current = Math.min((progress?.step ?? 0) + 1, steps);

  return (
    <main className="screen paper">
      <header className="top">
        <span className="brand">StepSight</span>
        <span className="chip hi">★ {xp} xp</span>
      </header>

      <section className="hero">
        <div>
          <p className="hand">Hi there, {name.toLowerCase()}!</p>
          <h1 className="title big">
            What are we <mark>building</mark> today?
          </h1>
        </div>
        <Timber pose="wave" size={128} />
      </section>

      {manual ? (
        <div className="folders">
          <Link href="/build" className="folder lavender">
            <span className="tab">BUILD</span>
            <span className="row-between">
              <span className="mono">{steps} steps</span>
              <span className="hand">
                {progress?.finishedAt ? "done!" : `step ${current} of ${steps}`}
              </span>
            </span>
            <span className="folder-title">{manual.title}</span>
            <span className="progress">
              <span style={{ width: `${(current / steps) * 100}%` }} />
            </span>
          </Link>
          <Link href="/parts" className="folder sky">
            <span className="tab">PARTS</span>
            <span className="folder-title">Check my parts</span>
            <span className="mono">One photo, Timber counts by color</span>
          </Link>
        </div>
      ) : (
        <div className="empty">
          <p className="hand">Paste a manual and I&apos;ll guide you step by step.</p>
        </div>
      )}

      <div className="links">
        <Link href="/gallery" className="secondary">
          Gallery{builds.length ? ` · ${builds.length}` : ""}
        </Link>
        <Link href="/find" className="secondary">
          Just find something
        </Link>
      </div>

      <div className="grow" />
      <button
        type="button"
        className="secondary"
        onClick={() => {
          startDemo();
          router.push("/build");
        }}
      >
        Demo
      </button>
      <Link href="/manual" className="primary">
        + New project
      </Link>
    </main>
  );
}
