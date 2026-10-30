"use client";

import { useT } from "../../lib/i18n";
import Link from "next/link";
import { useEffect, useState } from "react";
import Replay from "../../components/Replay";
import Timber from "../../components/Timber";
import { shareCard } from "../../lib/card";
import { play } from "../../lib/sound";
import type { Manual } from "../../lib/manual";
import { level, loadBuilds, loadManual, formatMinutes, loadProgress, loadReplay, minutesOf, saveBuilds, type Progress } from "../../lib/progress";

export default function DonePage() {
  const t = useT();
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
          minutes: minutesOf(p),
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
            <h1 className="title big">{t("Nothing finished yet")}</h1>
            <Timber pose="reading" size={96} />
            <Link href="/#ask" className="primary">
              {t("Start a project")}
            </Link>
          </>
        )}
      </main>
    );
  }

  const minutes = minutesOf(progress);
  const { name, next } = level(progress.xp);

  return (
    <main className="screen paper done">
      <div className="row-between">
        <span className="chip hi">{t("Level · {name}", { name: t(name) })}</span>
        <span className="chip">
          ★ {progress.stars}/{manual.steps.length}
        </span>
      </div>

      <div>
        <h1 className="title huge">{manual.mode === "fix" ? t("You fixed it.") : t("You built it.")}</h1>
        <p className="hand big">
          {manual.title} · {formatMinutes(minutes)} · {t("I just watched.")}
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
          <b>{formatMinutes(minutes)}</b>{t("time")}
        </span>
        <span>
          <b>
            {progress.stars}/{manual.steps.length}
          </b>
          {t("first try")}
        </span>
        <span>
          <b>{progress.mistakes}</b>{t("mistakes caught")}
        </span>
      </div>

      <div>
        <span className="progress thick">
          <span style={{ width: `${next ? Math.min(100, (progress.xp / next) * 100) : 100}%` }} />
        </span>
        <p className="mono row-between">
          <span>{progress.xp} xp</span>
          <span>{next ? t("next level at {n}", { n: next }) : t("max level")}</span>
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
            }, frames);
          } catch {}
          setSharing(false);
        }}
      >
        {sharing ? t("Making your card…") : t("Share my replay")}
      </button>
      <div className="row">
        <Link href="/gallery" className="secondary">
          {t("Gallery")}
        </Link>
        <Link href="/" className="secondary">
          {t("Home")}
        </Link>
      </div>
    </main>
  );
}
