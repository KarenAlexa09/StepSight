"use client";

import { useT } from "../../lib/i18n";
import Link from "next/link";
import { useEffect, useState } from "react";
import Timber from "../../components/Timber";
import type { Manual } from "../../lib/manual";
import { formatMinutes, level, loadBuilds, loadManual, loadProgress, type Build, type Progress } from "../../lib/progress";

// One place for everything: the project you're on, then every finished one with its photo (this used to be two tabs).
export default function ProjectsPage() {
  const t = useT();
  const [manual, setManual] = useState<Manual | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [builds, setBuilds] = useState<Build[]>([]);

  useEffect(() => {
    setManual(loadManual());
    setProgress(loadProgress());
    setBuilds(loadBuilds());
  }, []);

  const steps = manual?.steps.length ?? 0;
  const inProgress = manual && !progress?.finishedAt;
  const current = Math.min((progress?.step ?? 0) + 1, steps);
  const xp = progress?.xp ?? 0;

  return (
    <main className="screen c">
      <header className="c-top">
        <span className="c-muted" style={{ fontSize: 13 }}>
          {t("{n} projects · {xp} XP", { n: builds.length, xp })}
        </span>
        <span className="chip hi">{t(level(xp).name)}</span>
      </header>
      <div className="c-ask" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 className="c-h1" style={{ fontSize: 34, lineHeight: "40px" }}>
            {t("Projects")}
          </h1>
          <p className="c-muted">{t("Everything you built and fixed.")}</p>
        </div>
        <Timber pose="thumbs" size={64} move="none" />
      </div>

      {inProgress && (
        <>
          <p className="kicker">{t("IN PROGRESS")}</p>
          <Link href="/build" className="c-resume">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {manual.demo && <img src={`/demo/anim-${manual.demo}-1.jpg`} alt="" />}
            <span className="c-grow">
              <span className="kicker">{t("STEP {n} OF {total}", { n: current, total: steps })}</span>
              <span style={{ display: "block", fontSize: 16, fontWeight: 500, margin: "2px 0 8px" }}>{manual.title}</span>
              <span className="c-track">
                <span style={{ width: `${Math.round(((current - 1) / Math.max(steps, 1)) * 100)}%` }} />
              </span>
            </span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </Link>
        </>
      )}

      {builds.length > 0 && <p className="kicker">{t("FINISHED")}</p>}
      <div className="c-gallery">
        {builds.map((b) => (
          <Link key={b.finishedAt} href={`/projects/${b.finishedAt}`} className="c-card">
            <span className="c-card-photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {b.photo ? <img src={b.photo} alt="" /> : <Timber pose="celebrate" size={96} move="none" />}
              <span className="c-tag">{b.mode === "fix" ? t("FIX") : t("BUILD")}</span>
            </span>
            <b>{b.title}</b>
            <small>
              {t("{n} steps · {time}", { n: b.steps, time: formatMinutes(b.minutes) })} · ★ {b.stars}
            </small>
          </Link>
        ))}
        <Link href="/#ask" className="c-card-new">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {t(inProgress || builds.length ? "Your next project" : "Start a project")}
        </Link>
      </div>
    </main>
  );
}
