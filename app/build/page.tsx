"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import AskBar from "../../components/AskBar";
import CameraStage, { type CameraHandle } from "../../components/CameraStage";
import Timber from "../../components/Timber";
import { useTimber } from "../../components/useTimber";
import type { Manual, Part } from "../../lib/manual";
import { thumb } from "../../lib/image";
import { addReplayFrame, level, loadManual, loadProgress, saveProgress, XP_FIRST_TRY, XP_STEP, type Progress } from "../../lib/progress";
import type { Check, Intent } from "../../lib/spark";

type Phase = "work" | "checking" | "correct" | "fix";

const partPrompt = (p: Part) => (p.color.trim() ? `${p.color.trim().toLowerCase()} piece` : p.name);
const partLabel = (p: Part) => `${p.quantity}× ${p.color} ${p.name}`.replace("  ", " ");

export default function BuildPage() {
  const router = useRouter();
  const camera = useRef<CameraHandle>(null);
  const [manual, setManual] = useState<Manual | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [target, setTarget] = useState("");
  const [status, setStatus] = useState("Point the camera at your build");
  const [phase, setPhase] = useState<Phase>("work");
  const [check, setCheck] = useState<Check | null>(null);
  const [earned, setEarned] = useState({ xp: 0, firstTry: false });

  const step = manual && progress ? manual.steps[progress.step] : undefined;
  const timber = useTimber(onIntent, step && { instruction: step.instruction, parts: step.parts.map(partLabel) });

  useEffect(() => {
    const m = loadManual();
    if (!m) {
      router.replace("/manual");
      return;
    }
    const p = loadProgress();
    p.step = Math.min(p.step, m.steps.length - 1);
    setManual(m);
    setProgress(p);
    setTarget(m.steps[p.step].parts[0] ? partPrompt(m.steps[p.step].parts[0]) : "");
  }, [router]);

  function update(next: Progress) {
    setProgress(next);
    saveProgress(next);
  }

  function goTo(index: number, speak = true) {
    if (!manual || !progress) return;
    const i = Math.max(0, Math.min(index, manual.steps.length - 1));
    const s = manual.steps[i];
    update({ ...progress, step: i, triedThisStep: false });
    setTarget(s.parts[0] ? partPrompt(s.parts[0]) : "");
    setPhase("work");
    setCheck(null);
    setStatus(`Step ${i + 1} of ${manual.steps.length}`);
    if (speak) timber.say(s.instruction);
  }

  async function verify() {
    if (!step || !progress) return;
    const shot = camera.current?.capture();
    if (!shot) {
      setStatus("Camera isn't ready yet");
      return;
    }
    setPhase("checking");
    setStatus("Timber is checking your build…");
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: shot.image,
          step: { instruction: step.instruction, check: step.check, parts: step.parts.map(partLabel) },
        }),
      });
      const result: Check = await res.json();
      if (!res.ok) throw new Error((result as unknown as { error: string }).error);
      setCheck(result);
      setStatus(result.done ? "Step checked" : "Needs a fix");
      timber.say(result.done ? result.reply : result.fix || result.reply);
      if (result.done) {
        thumb(shot.image).then(addReplayFrame);
        const firstTry = !progress.triedThisStep;
        const xp = XP_STEP + (firstTry ? XP_FIRST_TRY : 0);
        setEarned({ xp, firstTry });
        update({
          ...progress,
          xp: progress.xp + xp,
          stars: progress.stars + (firstTry ? 1 : 0),
          streak: firstTry ? progress.streak + 1 : 0,
        });
        setPhase("correct");
      } else {
        update({ ...progress, mistakes: progress.mistakes + 1, streak: 0, triedThisStep: true });
        setPhase("fix");
      }
    } catch (error) {
      setPhase("work");
      setStatus(error instanceof Error && error.message ? error.message : "Couldn't check. Try again.");
    }
  }

  function advance() {
    if (!manual || !progress) return;
    if (progress.step >= manual.steps.length - 1) {
      update({ ...progress, finishedAt: Date.now() });
      router.push("/done");
      return;
    }
    goTo(progress.step + 1);
  }

  function onIntent(intent: Intent) {
    if (intent.action === "next") {
      timber.say(intent.reply);
      verify();
    } else if (intent.action === "back") {
      goTo((progress?.step ?? 0) - 1);
    } else if (intent.action === "find" && intent.target) {
      setTarget(intent.target);
      timber.say(intent.reply);
      camera.current?.find(intent.target);
    } else if (intent.action === "repeat" && step) {
      timber.say(step.instruction);
    } else {
      timber.say(intent.reply);
    }
  }

  if (!manual || !progress || !step) return <main className="screen paper" />;

  const total = manual.steps.length;
  const { name } = level(progress.xp);

  return (
    <main className="screen paper build">
      <header className="top">
        <Link href="/" className="round" aria-label="Home">
          ✕
        </Link>
        <span className="chip">
          Step {progress.step + 1} / {total}
        </span>
        <span className="chip mint">{progress.streak ? `streak ${progress.streak}` : name}</span>
      </header>
      <span className="progress" aria-hidden="true">
        <span style={{ width: `${((progress.step + 1) / total) * 100}%` }} />
      </span>

      <CameraStage ref={camera} live={false} autoTarget={target} onStatus={setStatus} />
      <p className="status" role="status">
        {status}
      </p>

      <section className="step-card">
        <Timber key={phase} pose={phase === "checking" ? "think" : "point"} size={56} className="peek" />
        <span className="step-count">
          p. {step.page} · {step.check}
        </span>
        <h1 className="instruction">{step.instruction}</h1>
        <div className="targets">
          {step.parts.map((p, i) => (
            <button
              key={i}
              type="button"
              className="part"
              aria-pressed={target === partPrompt(p)}
              onClick={() => {
                setTarget(partPrompt(p));
                camera.current?.find(partPrompt(p));
              }}
            >
              {partLabel(p)}
            </button>
          ))}
        </div>
      </section>

      <AskBar timber={timber} placeholder='Ask Timber: "where is the gray clip?"' />

      <div className="row">
        <button type="button" className="secondary" onClick={() => target && camera.current?.find(target)}>
          Show me
        </button>
        <button type="button" className="primary" onClick={verify} disabled={phase === "checking"}>
          {phase === "checking" ? "Checking…" : "Done, check me"}
        </button>
      </div>
      <div className="row small">
        <button type="button" className="link" onClick={() => goTo(progress.step - 1)} disabled={progress.step === 0}>
          ← Back
        </button>
        <button type="button" className="link" onClick={() => timber.setMuted(!timber.muted)}>
          {timber.muted ? "Sound off" : "Sound on"}
        </button>
        <button type="button" className="link" onClick={advance}>
          Skip →
        </button>
      </div>

      {phase === "correct" && (
        <div className="overlay-screen mint" role="dialog" aria-label="Step correct">
          <div className="confetti" aria-hidden="true">
            {Array.from({ length: 14 }, (_, i) => (
              <span key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.08}s` }} />
            ))}
          </div>
          <span className="stamp">✓ CHECKED</span>
          <Timber pose={earned.firstTry ? "celebrate" : "thumbs"} size={150} />
          <h2 className="title huge">Solid.</h2>
          <p className="hand big">{check?.reply || "Look at you, total foreman."}</p>
          <div className="stats">
            <span className="sticker">+{earned.xp} xp</span>
            <span className="sticker hi">{earned.firstTry ? "★ first try" : "fixed it"}</span>
            {progress.streak > 1 && <span className="sticker">streak {progress.streak}</span>}
          </div>
          <button type="button" className="primary" onClick={advance}>
            {progress.step >= total - 1 ? "Finish build" : "Next step →"}
          </button>
        </div>
      )}

      {phase === "fix" && (
        <div className="overlay-sheet" role="dialog" aria-label="Needs a fix">
          <div className="fix-card">
            <Timber pose="oops" size={64} />
            <div>
              <h2 className="title">Almost.</h2>
              <p>{check?.problem}</p>
              {check?.fix && <p className="hand">{check.fix}</p>}
            </div>
          </div>
          <div className="row">
            <button type="button" className="secondary" onClick={() => setPhase("work")}>
              Show me again
            </button>
            <button type="button" className="primary" onClick={verify}>
              Fixed it, check again
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
