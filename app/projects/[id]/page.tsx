"use client";

import { useT } from "../../../lib/i18n";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Replay from "../../../components/Replay";
import SourceTag from "../../../components/SourceTag";
import Timber from "../../../components/Timber";
import { useAnimation } from "../../../lib/anim";
import type { Manual } from "../../../lib/manual";
import { clearReplay, formatMinutes, freshProgress, loadBuilds, saveManual, saveProgress, type Build } from "../../../lib/progress";
import { getItem } from "../../../lib/store";

// A finished project kept as its own little manual: the replay, every step with its animation, and "Build it again".
export default function ProjectPage() {
  const t = useT();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [build, setBuild] = useState<Build | null | undefined>(undefined);
  const [frames, setFrames] = useState<string[]>([]);

  useEffect(() => {
    setBuild(loadBuilds().find((b) => String(b.finishedAt) === id) ?? null);
    getItem<string[]>(`replay.${id}`).then((f) => setFrames(f ?? []));
  }, [id]);

  if (build === undefined) return <main className="screen c" aria-busy="true" />;
  if (!build?.manual) {
    return (
      <main className="screen c">
        <h1 className="c-h1">{t("This project wasn't saved with its manual")}</h1>
        <Link href="/projects" className="c-btn">
          {t("Projects")}
        </Link>
      </main>
    );
  }
  const manual = build.manual;

  function again() {
    saveManual(manual);
    saveProgress(freshProgress());
    clearReplay();
    router.push("/build");
  }

  return (
    <main className="screen c">
      <header className="c-top">
        <Link href="/projects" className="c-back" aria-label={t("Projects")}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <span className="c-tag" style={{ position: "static", background: "var(--soft)" }}>
          {build.mode === "fix" ? t("FIX") : t("BUILD")}
        </span>
      </header>

      <div className="c-done-hero" style={{ marginTop: 0 }}>
        {frames.length ? (
          <Replay frames={frames} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          build.photo ? <img className="c-done-photo" src={build.photo} alt="" /> : <span className="c-done-photo" />
        )}
        <Timber pose="celebrate" size={96} move="none" className="c-done-timber" />
      </div>

      <div>
        <h1 className="c-h1">{build.title}</h1>
        <p className="c-muted">
          {t("{n} steps · {time}", { n: build.steps, time: formatMinutes(build.minutes) })} · ★ {build.stars}
        </p>
      </div>
      <SourceTag manual={manual} />

      <p className="kicker">{t("YOUR MANUAL")}</p>
      <ol className="c-steps">
        {manual.steps.map((step, i) => (
          <StepRow key={step.number} manual={manual} index={i} />
        ))}
      </ol>

      <div className="c-sticky">
        <button type="button" className="c-btn" onClick={again}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          {build.mode === "fix" ? t("Fix it again") : t("Build it again")}
        </button>
      </div>
    </main>
  );
}

function StepRow({ manual, index }: { manual: Manual; index: number }) {
  const t = useT();
  const step = manual.steps[index];
  const { image } = useAnimation(manual, index);
  return (
    <li>
      <span className={`c-num${step.safety ? " hi" : ""}`}>{step.number}</span>
      <span className="c-grow">
        {step.instruction}
        {image && (
          <span className="c-anim-frame c-step-strip">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt={t("Animation of this step: {step}", { step: step.instruction })} />
          </span>
        )}
      </span>
    </li>
  );
}
