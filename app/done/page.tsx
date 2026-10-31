"use client";

import { useT } from "../../lib/i18n";
import Link from "next/link";
import { useEffect, useState } from "react";
import Replay from "../../components/Replay";
import Timber from "../../components/Timber";
import { shareCard } from "../../lib/card";
import { thumb } from "../../lib/image";
import { setItem } from "../../lib/store";
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
    if (builds.some((b) => b.finishedAt === p.finishedAt)) return;
    const replay = loadReplay();
    setItem(`replay.${p.finishedAt}`, replay);
    const last = replay.at(-1);
    (last ? thumb(last, 240) : Promise.resolve(undefined)).then((photo) =>
      saveBuilds([
        {
          title: m.title,
          finishedAt: p.finishedAt!,
          minutes: minutesOf(p),
          steps: m.steps.length,
          stars: p.stars,
          mistakes: p.mistakes,
          mode: m.mode,
          photo,
          manual: m,
        },
        ...builds,
      ]),
    );
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
    <main className="screen c c-done">
      <div className="c-done-hero">
        {frames.length ? (
          <Replay frames={frames} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          manual.demo ? <img className="c-done-photo" src={`/demo/anim-${manual.demo}-${manual.steps.length}.jpg`} alt="" /> : <span className="c-done-photo" />
        )}
        <Timber pose="celebrate" size={120} move="hop" className="c-done-timber" />
      </div>

      <div>
        <h1 className="c-h1" style={{ fontSize: 40, lineHeight: "44px" }}>
          {manual.mode === "fix" ? t("You fixed it!") : t("You built it!")}
        </h1>
        <p className="c-muted">
          {manual.title} · {t("I just watched.")}
        </p>
      </div>

      <div className="c-stats">
        <span>
          <b>{formatMinutes(minutes)}</b>
          {t("time")}
        </span>
        <span>
          <b>
            {progress.stars} / {manual.steps.length}
          </b>
          {t("first try")}
        </span>
        <span>
          <b>{progress.mistakes}</b>
          {t("mistakes caught")}
        </span>
      </div>

      <div>
        <p className="c-row-between">
          <b>
            {t(name)} · {progress.xp} XP
          </b>
          <span className="c-muted" style={{ fontSize: 13 }}>
            {next ? t("next level at {n}", { n: next }) : t("max level")}
          </span>
        </p>
        <span className="c-xp">
          <span style={{ width: `${next ? Math.min(100, (progress.xp / next) * 100) : 100}%` }} />
        </span>
      </div>

      <div className="c-grow" />
      <button
        type="button"
        className="c-btn"
        disabled={sharing}
        onClick={async () => {
          setSharing(true);
          try {
            await shareCard(
              {
                title: manual.title,
                minutes,
                stars: progress.stars,
                steps: manual.steps.length,
                mistakes: progress.mistakes,
                photo: frames[frames.length - 1],
              },
              frames,
            );
          } catch {}
          setSharing(false);
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 15V3M7 8l5-5 5 5" />
          <path d="M5 13v7h14v-7" />
        </svg>
        {sharing ? t("Making your card…") : t("Share my replay")}
      </button>
      <div className="c-chips">
        <Link href="/projects" className="c-link">
          {t("Projects")}
        </Link>
        <Link href="/" className="c-link">
          {t("Home")}
        </Link>
      </div>
    </main>
  );
}
