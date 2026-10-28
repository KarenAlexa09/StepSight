"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ActionIcon from "../../components/ActionIcon";
import CameraStage, { type CameraHandle } from "../../components/CameraStage";
import HelpSheet from "../../components/HelpSheet";
import Timber from "../../components/Timber";
import { useTimber } from "../../components/useTimber";
import { thumb } from "../../lib/image";
import type { Manual, Part, Step } from "../../lib/manual";
import {
  addReplayFrame,
  level,
  loadManual,
  loadProgress,
  saveProgress,
  XP_DO,
  XP_FIRST_TRY,
  XP_STEP,
  type Progress,
} from "../../lib/progress";
import { setSettings, useSettings } from "../../lib/settings";
import { play } from "../../lib/sound";
import type { Check, Intent } from "../../lib/spark";

type Phase = "work" | "checking" | "correct" | "fix";

const partPrompt = (p: Part) => (p.color.trim() ? `${p.color.trim().toLowerCase()} piece` : p.name);
const kindOf = (s: Step) => s.kind ?? "verify";
const targetOf = (s: Step) => s.target?.trim() || (s.parts[0] ? partPrompt(s.parts[0]) : "");
const partLabel = (p: Part) => `${p.quantity}× ${p.color} ${p.name}`.replace("  ", " ");
const HINT = {
  do: "No photo needed. Just do it, then tap Done.",
  find: "Tap Show me and I'll point it out.",
  verify: "When you're done I'll check it with a photo.",
};

function kicker(s: Step) {
  const type = s.motion?.type;
  if (type === "connect") return "CONNECT";
  if (type === "move") return "MOVE";
  if (type === "remove") return "TAKE OFF";
  return { do: "DO IT", find: "FIND IT", verify: "BUILD" }[kindOf(s)];
}

export default function BuildPage() {
  const router = useRouter();
  const camera = useRef<CameraHandle>(null);
  const settings = useSettings();
  const [manual, setManual] = useState<Manual | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [target, setTarget] = useState("");
  const [status, setStatus] = useState("Point the camera at your build");
  const [phase, setPhase] = useState<Phase>("work");
  const [check, setCheck] = useState<Check | null>(null);
  const [earned, setEarned] = useState({ xp: 0, firstTry: false });
  const [ticked, setTicked] = useState<number[]>([]);
  const [help, setHelp] = useState(false);
  const [simple, setSimple] = useState("");

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
    setTarget(targetOf(m.steps[p.step]));
  }, [router]);

  function show(t = target) {
    play("boop");
    camera.current?.find(t, step && t === targetOf(step) ? step.motion : undefined);
  }

  function update(next: Progress) {
    setProgress(next);
    saveProgress(next);
  }

  function goTo(index: number, speak = true, from = progress) {
    if (!manual || !from) return;
    const i = Math.max(0, Math.min(index, manual.steps.length - 1));
    const s = manual.steps[i];
    update({ ...from, step: i, triedThisStep: false });
    setTarget(targetOf(s));
    setPhase("work");
    setCheck(null);
    setSimple("");
    setHelp(false);
    setStatus(`Step ${i + 1} of ${manual.steps.length}`);
    if (speak) timber.say(s.instruction);
  }

  function celebrateLevel(before: number, gained: number) {
    if (level(before).name !== level(before + gained).name) setTimeout(() => play("level"), 900);
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
        play("success");
        celebrateLevel(progress.xp, xp);
        setPhase("correct");
      } else {
        update({ ...progress, mistakes: progress.mistakes + 1, streak: 0, triedThisStep: true });
        play("oops");
        setPhase("fix");
      }
    } catch (error) {
      setPhase("work");
      setStatus(error instanceof Error && error.message ? error.message : "Couldn't check. Try again.");
    }
  }

  function completeDo() {
    if (!progress || !step) return;
    const next = { ...progress, xp: progress.xp + XP_DO };
    setStatus(`+${XP_DO} xp`);
    play("tuck");
    celebrateLevel(progress.xp, XP_DO);
    if (progress.step >= (manual?.steps.length ?? 0) - 1) {
      update({ ...next, finishedAt: Date.now() });
      router.push("/done");
      return;
    }
    goTo(progress.step + 1, true, next);
  }

  function startSteps() {
    if (!progress || !manual) return;
    update({ ...progress, prepDone: true });
    timber.say(manual.steps[progress.step].instruction);
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

  async function explain() {
    if (!step) return;
    setSimple("…");
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          said: "Explain this step in two very short, simple sentences for a total beginner.",
          step: { instruction: step.instruction, parts: step.parts.map(partLabel) },
        }),
      });
      const intent = await res.json();
      if (!res.ok) throw new Error(intent.error);
      setSimple(intent.reply);
      timber.say(intent.reply);
    } catch {
      setSimple("Do what the card says, one small move at a time.");
    }
  }

  function again() {
    setHelp(false);
    if (!camera.current?.replay()) show();
  }

  function onIntent(intent: Intent) {
    if (intent.action === "next") {
      timber.say(intent.reply);
      if (step && kindOf(step) !== "verify") completeDo();
      else verify();
    } else if (intent.action === "back") {
      goTo((progress?.step ?? 0) - 1);
    } else if (intent.action === "find" && intent.target) {
      setTarget(intent.target);
      timber.say(intent.reply);
      show(intent.target);
    } else if (intent.action === "repeat" && step) {
      timber.say(step.instruction);
    } else {
      timber.say(intent.reply);
    }
  }

  if (!manual || !progress || !step) return <main className="screen paper" />;

  const total = manual.steps.length;
  const kind = kindOf(step);
  const fixing = manual.mode === "fix";
  const done = kind === "verify" ? verify : completeDo;

  if (manual.prep?.length && !progress.prepDone) {
    return (
      <main className="screen paper build">
        <header className="top">
          <Link href="/" className="round" aria-label="Home">
            ✕
          </Link>
          <span className="chip">Before you start</span>
        </header>
        <div className="hero">
          <h1 className="title big">
            Let&apos;s get <mark>ready</mark>
          </h1>
          <Timber pose="reading" size={110} />
        </div>
        <p className="hand">{manual.title}</p>
        <ul className="prep">
          {manual.prep.map((item, i) => (
            <li key={i}>
              <label>
                <input
                  type="checkbox"
                  checked={ticked.includes(i)}
                  onChange={() => setTicked((t) => (t.includes(i) ? t.filter((n) => n !== i) : [...t, i]))}
                />
                <span>{item}</span>
              </label>
            </li>
          ))}
        </ul>
        <p className="tip">
          {total} steps. Some need no photo: just do them and tap Done. I&apos;ll only check with a camera when it helps.
        </p>
        <div className="grow" />
        <button type="button" className="primary" onClick={startSteps}>
          {ticked.length === manual.prep.length ? "Ready, let's go" : "Start anyway"}
        </button>
      </main>
    );
  }

  return (
    <main className="screen paper build v3">
      <header className="top">
        <Link href="/" className="round" aria-label="Home">
          ✕
        </Link>
        <div className="stepmeta">
          <span className="mono">
            Step {progress.step + 1} of {total}
          </span>
          <span className="dots" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }} aria-hidden="true">
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={i < progress.step ? "done" : i === progress.step ? "now" : ""} />
            ))}
          </span>
        </div>
        <button
          type="button"
          className="round"
          aria-label={settings.sound ? "Sound is on. Tap to mute" : "Sound is off. Tap to turn on"}
          aria-pressed={settings.sound}
          onClick={() => setSettings({ sound: !settings.sound })}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 9v6h4l5 4V5L8 9z" />
            {settings.sound ? <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /> : <path d="M17 9l5 6M22 9l-5 6" />}
          </svg>
        </button>
      </header>

      <CameraStage ref={camera} live={false} autoTarget={target} resetKey={progress.step} onStatus={setStatus} />
      <p className="status" role="status">
        {status}
      </p>

      <section className="action-card">
        <span className="tile">
          <ActionIcon motion={step.motion} kind={kind} />
        </span>
        <div className="action-text">
          <span className="kicker">
            {kicker(step)}
            {step.page > 0 && ` · p. ${step.page}`}
          </span>
          <h1 className="instruction">{step.instruction}</h1>
        </div>
      </section>
      <p className="tip">{kind === "verify" && !fixing && step.check ? `I'll check: ${step.check}` : HINT[kind]}</p>

      {step.parts.length > 0 && (
        <div className="targets">
          {step.parts.map((p, i) => (
            <button
              key={i}
              type="button"
              className="part"
              aria-pressed={target === partPrompt(p)}
              onClick={() => {
                setTarget(partPrompt(p));
                show(partPrompt(p));
              }}
            >
              {partLabel(p)}
            </button>
          ))}
        </div>
      )}

      <div className="grow" />
      <button type="button" className="cta" onClick={target ? () => show() : done} disabled={phase === "checking"}>
        {target ? "Show me" : kind === "verify" ? "Done, check me" : "Done, next →"}
      </button>
      <div className="row3">
        <button type="button" className="secondary done" onClick={done} disabled={phase === "checking"}>
          {phase === "checking" ? "Checking…" : kind === "verify" ? "✓ Done, check" : "✓ Done"}
        </button>
        <button type="button" className="secondary" onClick={() => setHelp(true)}>
          I&apos;m lost
        </button>
        <button
          type="button"
          className="round mic"
          aria-label={timber.listening ? "Stop listening" : "Talk to Timber"}
          aria-pressed={timber.listening}
          onClick={timber.listen}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        </button>
      </div>
      {(timber.thinking || timber.heard) && (
        <p className="heard" role="status">
          {timber.thinking ? "Timber is thinking…" : `“${timber.heard}”`}
        </p>
      )}

      {help && (
        <HelpSheet
          manual={manual}
          step={step}
          simple={simple}
          timber={timber}
          canBack={progress.step > 0}
          onClose={() => setHelp(false)}
          onAgain={again}
          onSimple={explain}
          onBack={() => goTo(progress.step - 1)}
          onSkip={advance}
        />
      )}

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
            {progress.step >= total - 1 ? "Finish" : "Next step →"}
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
