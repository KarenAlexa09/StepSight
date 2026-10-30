"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ActionIcon from "../../components/ActionIcon";
import { demoPhoto } from "../../lib/demo";
import CameraStage, { type CameraHandle } from "../../components/CameraStage";
import HelpSheet from "../../components/HelpSheet";
import Timber from "../../components/Timber";
import { useTimber } from "../../components/useTimber";
import { cropBox, thumb, type Shot } from "../../lib/image";
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
const AUTO_MS = 1600;

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
  const advanceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
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
  const [demoAfter, setDemoAfter] = useState(false);
  const [piece, setPiece] = useState<string | null>(null);
  const [simple, setSimple] = useState("");
  const [empty, setEmpty] = useState(false);

  const step = manual && progress ? manual.steps[progress.step] : undefined;
  const timber = useTimber(onIntent, step && { instruction: step.instruction, parts: step.parts.map(partLabel) });

  useEffect(() => () => clearTimeout(advanceTimer.current), []);

  useEffect(() => {
    const m = loadManual();
    if (!m) {
      setEmpty(true);
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
    setDemoAfter(false);
    setPiece(null);
    setCheck(null);
    setSimple("");
    setHelp(false);
    setStatus(`Step ${i + 1} of ${manual.steps.length}`);
    if (speak) timber.say(s.instruction);
  }

  function celebrateLevel(before: number, gained: number) {
    if (level(before).name !== level(before + gained).name) setTimeout(() => play("level"), 900);
  }

  function proceed(from: Progress) {
    clearTimeout(advanceTimer.current);
    if (!manual) return;
    if (from.step >= manual.steps.length - 1) {
      update({ ...from, finishedAt: Date.now() });
      router.push("/done");
      return;
    }
    goTo(from.step + 1, true, from);
  }

  async function findPiece(shot: Shot, prompt: string) {
    try {
      const res = await fetch("/api/segment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: shot.image, prompt, width: shot.width, height: shot.height }),
      });
      const data = await res.json();
      if (res.ok && data.matches?.[0]) setPiece(await cropBox(shot.image, data.matches[0].bounds));
    } catch {}
  }

  async function verify() {
    if (!step || !progress) return;
    if (manual?.demo) {
      setDemoAfter(true);
      await new Promise((r) => setTimeout(r, 600));
    }
    const shot = camera.current?.capture();
    if (!shot) {
      setStatus("Camera isn't ready yet");
      return;
    }
    setPhase("checking");
    setPiece(null);
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
      if (!result.done) timber.say(result.fix || result.reply);
      if (result.done) {
        thumb(shot.image, 560).then(addReplayFrame);
        const firstTry = !progress.triedThisStep;
        const xp = XP_STEP + (firstTry ? XP_FIRST_TRY : 0);
        setEarned({ xp, firstTry });
        const next = {
          ...progress,
          xp: progress.xp + xp,
          stars: progress.stars + (firstTry ? 1 : 0),
          streak: firstTry ? progress.streak + 1 : 0,
        };
        update(next);
        play("success");
        celebrateLevel(progress.xp, xp);
        setPhase("correct");
        advanceTimer.current = setTimeout(() => proceed(next), AUTO_MS);
      } else {
        update({ ...progress, mistakes: progress.mistakes + 1, streak: 0, triedThisStep: true });
        play("oops");
        setPhase("fix");
        if (targetOf(step)) findPiece(shot, targetOf(step));
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

  if (empty) {
    return (
      <main className="screen paper">
        <header className="top">
          <Link href="/" className="round" aria-label="Home">
            ←
          </Link>
          <span className="chip">Projects</span>
        </header>
        <div className="hero">
          <h1 className="title big">No project yet</h1>
          <Timber pose="reading" size={96} />
        </div>
        <Link href="/#ask" className="primary">
          Start one
        </Link>
      </main>
    );
  }

  if (!manual || !progress || !step) return <main className="screen paper" />;

  const total = manual.steps.length;
  const kind = kindOf(step);
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

      <div className={`stage-wrap ${phase}`}>
        <CameraStage
          ref={camera}
          live={false}
          autoTarget={target}
          resetKey={progress.step}
          demo={manual?.demo ? demoPhoto(progress.step, demoAfter, progress.triedThisStep) : undefined}
          onStatus={setStatus}
        />
        <span className="stage-status" role="status">
          {status}
        </span>
        {(phase === "work" || phase === "fix") && (target || phase === "fix") && (
          <button
            type="button"
            className="showme"
            onClick={() => {
              setPhase("work");
              show();
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
            </svg>
            Show me
          </button>
        )}
        {phase === "correct" && (
          <div className="verdict ok" role="status">
            <span className="verdict-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12l5 5 9-10" />
              </svg>
            </span>
            <div className="verdict-text">
              <b>Solid!</b>
              <span className="hand">{check?.reply || "Looks just right."}</span>
            </div>
            <div className="verdict-stats">
              <span className="sticker">+{earned.xp} xp</span>
              <span className="sticker hi">{earned.firstTry ? "first try" : "fixed it"}</span>
            </div>
          </div>
        )}
        {phase === "fix" && (
          <div className="verdict bad" role="alert">
            <span className="verdict-timber">
              <Timber pose="oops" size={84} />
            </span>
            <div className="verdict-text">
              <b>Almost.</b>
              <span>{check?.problem}</span>
              {check?.fix && <span className="hand">{check.fix}</span>}
            </div>
            {piece && (
              <figure className="verdict-piece">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={piece} alt={`Close-up of the ${targetOf(step)}`} />
                <figcaption>this one</figcaption>
              </figure>
            )}
          </div>
        )}
      </div>

      <section className="action-card compact">
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

      <button
        type="button"
        className={`cta${phase === "correct" ? " auto" : ""}`}
        onClick={phase === "correct" ? () => proceed(progress) : done}
        disabled={phase === "checking"}
      >
        {phase === "checking"
          ? "Checking…"
          : phase === "correct"
            ? progress.step >= total - 1
              ? "Finish"
              : "Next step →"
            : phase === "fix"
              ? "Check again"
              : kind === "verify"
                ? "Check my step"
                : "Done"}
      </button>
      <div className="row3">
        <button type="button" className="secondary" onClick={() => setHelp(true)}>
          I&apos;m lost
        </button>
        <button type="button" className="secondary" onClick={advance}>
          Skip step
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
    </main>
  );
}
