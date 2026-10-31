"use client";

import { useT } from "../../lib/i18n";
import Link from "next/link";
import { useEffect, useState } from "react";
import Timber from "../../components/Timber";
import type { Manual } from "../../lib/manual";
import { formatMinutes, loadBuilds, loadManual, loadProgress, type Build, type Progress } from "../../lib/progress";

// The Projects tab: the project you're on (if any) plus everything finished. Before, the tab
// opened /build, which dropped you on the last step of a finished project.
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
  const finished = Boolean(progress?.finishedAt);
  const current = Math.min((progress?.step ?? 0) + 1, steps);

  return (
    <main className="screen c">
      <header className="c-top">
        <h1 className="c-h1">{t("Projects")}</h1>
        <Timber pose="reading" size={64} move="none" />
      </header>

      {manual && !finished && (
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

      {builds.length > 0 && (
        <>
          <p className="kicker">{t("FINISHED")}</p>
          <ul className="c-steps">
            {builds.map((b) => (
              <li key={b.finishedAt}>
                <span className="c-num hi">✓</span>
                <span className="c-grow">
                  {b.title}
                  <span className="c-muted" style={{ display: "block", fontSize: 13 }}>
                    {t("{n} steps · {time}", { n: b.steps, time: formatMinutes(b.minutes) })} · ★ {b.stars}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {(!manual || finished) && (
        <>
          {builds.length === 0 && <p className="c-muted">{t("No projects yet. Tell Timber what you need and it shows up here.")}</p>}
          <div className="c-grow" />
          <Link href="/#ask" className="c-btn">
            {t("Start a project")}
          </Link>
        </>
      )}
    </main>
  );
}
