"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Replay from "../../components/Replay";
import Timber from "../../components/Timber";
import { shareCard } from "../../lib/card";
import { play } from "../../lib/sound";
import type { Manual } from "../../lib/manual";
import { level, loadBuilds, loadManual, loadProgress, loadReplay, saveBuilds, type Progress } from "../../lib/progress";

export default function DonePage() {
  const [manual, setManual] = useState<Manual | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [frames, setFrames] = useState<string[]>([]);
  const [sharing, setSharing] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const m = loadManual();
    const p = loadProgress();
    setReady(true);
    setManual(m);
    setProgress(p);
    setFrames(loadReplay());
    if (!m || !p.finishedAt) return;
    const builds = loadBuilds();
    if (!builds.some((b) => b.finishedAt === p.finishedAt)) {
      saveBuilds([
        {
          title: m.title,
          finishedAt: p.finishedAt,
          minutes: Math.max(1, Math.round((p.finishedAt - p.startedAt) / 60000)),
          steps: m.steps.length,
          stars: p.stars,
          mistakes: p.mistakes,
        },
        ...builds,
      ]);
    }
  }, []);

  useEffect(() => {
    if (manual) play("level");
  }, [manual]);

  if (!manual || !progress) {
    return (
      <main className="screen paper" aria-busy={!ready}>
        {ready && (
          <>
            <h1 className="title big">Nothing finished yet</h1>
            <Timber pose="reading" size={96} />
            <Link href="/#ask" className="primary">
              Start a project
            </Link>
          </>
        )}
      </main>
    );
  }

  const minutes = Math.max(1, Math.round(((progress.finishedAt ?? Date.now()) - progress.startedAt) / 60000));
  const { name, next } = level(progress.xp);

  return (
    <main className="screen paper done">
      <div className="row-between">
        <span className="chip hi">Level · {name}</span>
        <span className="chip">
          ★ {progress.stars}/{manual.steps.length}
        </span>
      </div>

      <div>
        <h1 className="title huge">{manual.mode === "fix" ? "You fixed it." : "You built it."}</h1>
        <p className="hand big">
          {manual.title} · {minutes} min · I just watched.
        </p>
      </div>

      {frames.length ? (
        <div className="done-hero">
          <span className="done-timber">
            <Timber pose="lean" size={88} />
          </span>
          <Replay frames={frames} />
        </div>
      ) : (<div className="grow center"><Timber pose="hardhat" move="none" size={110} /></div>)}

      <div className="stat3">
        <span>
          <b>{minutes} min</b>time
        </span>
        <span>
          <b>
            {progress.stars}/{manual.steps.length}
          </b>
          first try
        </span>
        <span>
          <b>{progress.mistakes}</b>mistakes caught
        </span>
      </div>

      <div>
        <span className="progress thick">
          <span style={{ width: `${next ? Math.min(100, (progress.xp / next) * 100) : 100}%` }} />
        </span>
        <p className="mono row-between">
          <span>{progress.xp} xp</span>
          <span>{next ? `next level at ${next}` : "max level"}</span>
        </p>
      </div>

      <button
        type="button"
        className="cta"
        disabled={sharing}
        onClick={async () => {
          setSharing(true);
          try {
            await shareCard({
              title: manual.title,
              minutes,
              stars: progress.stars,
              steps: manual.steps.length,
              mistakes: progress.mistakes,
              photo: frames[frames.length - 1],
            });
          } catch {}
          setSharing(false);
        }}
      >
        {sharing ? "Making your card…" : "Share my replay"}
      </button>
      <div className="row">
        <Link href="/gallery" className="secondary">
          Gallery
        </Link>
        <Link href="/" className="secondary">
          Home
        </Link>
      </div>
    </main>
  );
}
